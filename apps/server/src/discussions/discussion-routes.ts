import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { AgentName } from "@ai-task-router/shared";
import { discussionService, DiscussionServiceError } from "./discussion-service";

/**
 * The dashboard's view of a discussion.
 *
 * Deliberately thin: every rule about who speaks and what gets written lives
 * in the service, so these handlers validate input and hand it over. The MCP
 * tools call the same service for the same reason the Task ones do — a rule
 * that exists twice is a rule that will eventually differ.
 *
 * There is no endpoint here that writes a file, runs a test or touches a
 * branch. A discussion may not do any of those, and the surest way to keep
 * that true is to never build the door.
 */

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function fail(res: Response, err: unknown): void {
  if (err instanceof DiscussionServiceError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  throw err;
}

/** Express's ParamsDictionary has an index signature, so under
 * noUncheckedIndexedAccess `req.params.id` types as `string | undefined`
 * even though the router guarantees it's present for a matched `:id` route. */
function roomId(req: Request): string {
  const id = req.params.id;
  if (!id) throw new DiscussionServiceError("논의 ID 파라미터가 없습니다.", 400);
  return id;
}

const agentSchema = z.enum(["claude", "codex"]);

const createSchema = z.object({
  title: z.string().min(1),
  repos: z.array(z.string().min(1)).min(1),
  participants: z.array(agentSchema).optional(),
  summary: z
    .object({
      facts: z.array(z.string()).optional(),
      agreed: z.array(z.string()).optional(),
      open: z.array(z.string()).optional(),
    })
    .optional(),
});

const messageSchema = z.object({ text: z.string().min(1) });

const turnSchema = z.object({
  agent: agentSchema,
  grounds: z.boolean(),
  body: z.string().optional(),
  sources: z.array(z.string()).optional(),
  baseRevision: z.number().int().nonnegative().optional(),
  summaryDelta: z
    .object({
      facts: z.array(z.string()).optional(),
      agreed: z.array(z.string()).optional(),
      open: z.array(z.string()).optional(),
      decisions: z.array(z.string()).optional(),
    })
    .optional(),
});

export const discussionRouter = Router();

discussionRouter.get("/", (_req, res) => {
  res.json(discussionService.list());
});

discussionRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "논의 생성 입력이 올바르지 않습니다." });
      return;
    }
    try {
      res.status(201).json(await discussionService.create(parsed.data));
    } catch (err) {
      fail(res, err);
    }
  }),
);

discussionRouter.get("/:id", (req, res) => {
  try {
    res.json({
      discussion: discussionService.get(roomId(req)),
      turn: discussionService.turnView(roomId(req)),
    });
  } catch (err) {
    fail(res, err);
  }
});

/** The document itself — the same bytes an agent reads before it answers. */
discussionRouter.get("/:id/document", (req, res) => {
  const agent = typeof req.query.agent === "string" ? (req.query.agent as AgentName) : undefined;
  try {
    res.type("text/markdown").send(discussionService.document(roomId(req), agent));
  } catch (err) {
    fail(res, err);
  }
});

discussionRouter.post(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "메시지가 비어 있습니다." });
      return;
    }
    try {
      const result = await discussionService.postUserMessage(roomId(req), parsed.data.text);
      res.json({ ...result, turn: discussionService.turnView(roomId(req)) });
    } catch (err) {
      fail(res, err);
    }
  }),
);

/** 계속 — another round with nothing new from the user. */
discussionRouter.post("/:id/advance", (req, res) => {
  try {
    const plan = discussionService.advance(roomId(req));
    res.json({
      plan,
      discussion: discussionService.get(roomId(req)),
      turn: discussionService.turnView(roomId(req)),
    });
  } catch (err) {
    fail(res, err);
  }
});

discussionRouter.get("/:id/turn", (req, res) => {
  const agent = req.query.agent;
  try {
    if (typeof agent === "string") {
      res.json(discussionService.claimTurn(roomId(req), agent as AgentName));
      return;
    }
    res.json(discussionService.turnView(roomId(req)));
  } catch (err) {
    fail(res, err);
  }
});

discussionRouter.post(
  "/:id/turn",
  asyncHandler(async (req, res) => {
    const parsed = turnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "턴 제출 입력이 올바르지 않습니다." });
      return;
    }
    try {
      const result = await discussionService.submitTurn(roomId(req), parsed.data);
      res.json({ ...result, turn: discussionService.turnView(roomId(req)) });
    } catch (err) {
      fail(res, err);
    }
  }),
);

/** Drops an open round. Nothing already appended is touched — it cannot be. */
discussionRouter.delete("/:id/turn", (req, res) => {
  try {
    discussionService.abandonRound(roomId(req));
    res.json(discussionService.turnView(roomId(req)));
  } catch (err) {
    fail(res, err);
  }
});

discussionRouter.post(
  "/:id/repos",
  asyncHandler(async (req, res) => {
    const repo = typeof req.body?.repo === "string" ? req.body.repo : "";
    try {
      res.json(await discussionService.addRepo(roomId(req), repo));
    } catch (err) {
      fail(res, err);
    }
  }),
);

/** Ending a discussion belongs to the user, so it is a route and never a rule. */
discussionRouter.post(
  "/:id/close",
  asyncHandler(async (req, res) => {
    try {
      res.json(await discussionService.setStatus(roomId(req), "closed"));
    } catch (err) {
      fail(res, err);
    }
  }),
);
