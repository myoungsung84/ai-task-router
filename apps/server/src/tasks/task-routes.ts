import { Router, type Request, type Response, type NextFunction } from "express";
import { taskService, TaskServiceError } from "./task-service";
import { taskSpecSchema } from "./task-input";
import { taskEventsHandler } from "../stream/sse";

/** Wraps a handler that genuinely awaits something, so a rejected promise reaches the error handler below instead of crashing the process. */
function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

/** Express's ParamsDictionary has an index signature, so under
 * noUncheckedIndexedAccess `req.params.id` types as `string | undefined`
 * even though the router guarantees it's present for a matched `:id` route. */
function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (!id) throw new TaskServiceError("id 파라미터가 없습니다.", 400);
  return id;
}

export const taskRouter = Router();

// The handlers below are plain (non-async) on purpose where TaskService's
// call is synchronous — Express 4 already forwards a synchronous throw to
// the error handler at the bottom of this router, no wrapper needed. Only
// the two routes that actually `await` (diff, start) use asyncHandler.

taskRouter.get("/", (_req, res) => {
  res.json(taskService.listTasks());
});

taskRouter.post("/", (req, res) => {
  const parsed = taskSpecSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." });
    return;
  }
  const task = taskService.createTask(parsed.data);
  res.status(201).json(task);
});

taskRouter.get("/:id", (req, res) => {
  const task = taskService.getTask(requireIdParam(req));
  if (!task) {
    res.status(404).json({ error: "Task를 찾을 수 없습니다." });
    return;
  }
  res.json(task);
});

taskRouter.get(
  "/:id/diff",
  asyncHandler(async (req, res) => {
    const diff = await taskService.getTaskDiff(requireIdParam(req));
    res.json(diff);
  }),
);

taskRouter.get("/:id/result", (req, res) => {
  res.json(taskService.getTaskResult(requireIdParam(req)));
});

taskRouter.post(
  "/:id/start",
  asyncHandler(async (req, res) => {
    const task = await taskService.startTask(requireIdParam(req));
    res.json(task);
  }),
);

taskRouter.post("/:id/cancel", (req, res) => {
  const task = taskService.cancelTask(requireIdParam(req));
  res.json(task);
});

// Completed-task cleanup (Settings/History UX) — RUNNING/REVIEWING tasks are
// rejected by taskService.deleteTask, never force-removed.
taskRouter.delete("/:id", (req, res) => {
  taskService.deleteTask(requireIdParam(req));
  res.status(204).end();
});

taskRouter.get("/:id/events", taskEventsHandler);

// Central error handler for TaskServiceError raised anywhere above.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
taskRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof TaskServiceError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error("[task-routes] unexpected error:", err);
  res.status(500).json({ error: "서버 내부 오류가 발생했습니다." });
});
