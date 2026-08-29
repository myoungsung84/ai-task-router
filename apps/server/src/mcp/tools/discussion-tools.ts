import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { discussionService, DiscussionServiceError } from "../../discussions/discussion-service";

/**
 * How an AI takes part in a discussion.
 *
 * The boundary drawn here is that **a tool never judges and a skill never
 * stores**. Everything below moves bytes — read the document, claim a turn,
 * append an entry — and none of it decides what is worth saying, which
 * position to hold, or whether a user sentence was a decision. That judgment
 * belongs to the discussion skill, where it can be revised by editing a prompt
 * instead of shipping a server, and where a third participant added later
 * inherits the same tools without any of them learning a new special case.
 *
 * Participation is pull, not push. The Router never spawns an agent to make it
 * speak: a Claude or Codex session already talking to the user asks whether it
 * is its turn and submits when it has one. That is the entry point the
 * proposal actually describes, and it keeps the Router out of owning an
 * agent's lifecycle in order to hold a conversation.
 *
 * The order of a turn is not enforced by these tools either — it is the skill
 * that reads before it writes. What the tools do guarantee is the part a
 * prompt cannot: entries are appended in one order, anchors are handed out by
 * the document, and a retry after a crash does not produce the same opinion
 * twice.
 */

function textResult(payload: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function markdownResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function messageOf(err: unknown): string {
  if (err instanceof DiscussionServiceError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

const ROOM_ID = "논의 ID (예: D-3)";
const agentSchema = z.enum(["claude", "codex"]);

export function registerDiscussionTools(server: McpServer): void {
  server.registerTool(
    "create_discussion",
    {
      title: "Create Discussion",
      description:
        "새 논의방과 원본 논의 문서를 만든다. 안건을 구조화하는 것은 호출자(스킬)의 몫이고, 이 도구는 " +
        "받은 구조를 그대로 기록한다. repos는 필수이며 AI가 조사해도 되는 범위를 뜻한다 — 여기 없는 " +
        "저장소는 읽지 않는다. 논의는 여러 저장소를 가로지르는 것이 기본이므로 목록으로 받는다. " +
        "facts에는 확인된 사실만 넣고, 확실하지 않은 것은 open에 둔다: 문서에 사실로 적히면 이후 모든 " +
        "발언이 그 위에 쌓인다.",
      inputSchema: {
        title: z.string().min(1).describe("논의 제목"),
        repos: z.array(z.string().min(1)).min(1).describe("관련 프로젝트 저장소 (조사 범위)"),
        participants: z
          .array(agentSchema)
          .optional()
          .describe("기본 참여자. 생략하면 claude, codex"),
        facts: z.array(z.string()).optional().describe("확인된 사실"),
        agreed: z.array(z.string()).optional().describe("이미 합의된 내용"),
        open: z.array(z.string()).optional().describe("미결정 쟁점과 미확인 사항"),
      },
    },
    async (args) => {
      try {
        const discussion = await discussionService.create({
          title: args.title,
          repos: args.repos,
          participants: args.participants,
          summary: { facts: args.facts, agreed: args.agreed, open: args.open },
        });
        return textResult(discussion);
      } catch (err) {
        return errorResult(messageOf(err));
      }
    },
  );

  server.registerTool(
    "list_discussions",
    {
      title: "List Discussions",
      description: "논의 목록을 최근 갱신 순으로 반환한다. 메시지 본문은 포함하지 않는다.",
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(discussionService.list());
      } catch (err) {
        return errorResult(messageOf(err));
      }
    },
  );

  server.registerTool(
    "read_discussion_document",
    {
      title: "Read Discussion Document",
      description:
        "원본 논의 문서 전체를 마크다운 그대로 반환한다. 발언하기 전에 반드시 이걸 읽어라 — 채팅 요약이 " +
        "아니라 이 문서가 판단의 유일한 기준이다. 앞선 AI의 상세 근거, 사용자 의견과 결정, 확인된 사실이 " +
        "모두 여기에 있다. 문서는 append-only라 항목 번호(#47)는 영구적이며, 인용할 때 그 번호를 쓴다.",
      inputSchema: {
        discussionId: z.string().describe(ROOM_ID),
        agent: agentSchema
          .optional()
          .describe("내가 누구인지. 넘기면 이번 라운드에 문서를 읽었다고 방에 표시된다"),
      },
    },
    async (args) => {
      try {
        return markdownResult(discussionService.document(args.discussionId, args.agent));
      } catch (err) {
        return errorResult(messageOf(err));
      }
    },
  );

  server.registerTool(
    "claim_discussion_turn",
    {
      title: "Claim Discussion Turn",
      description:
        "지금 내 차례인지 확인한다. yourTurn이 false면 아무것도 하지 말고 기다려라 — 차례가 아닌데 쓰면 " +
        "거부된다. revision은 내가 읽은 기준 버전이고, submit_discussion_turn에 baseRevision으로 넘기면 " +
        "그 사이에 문서가 바뀌었는지 알려준다. addressed가 true면 사용자가 나를 직접 지목한 것이므로 " +
        "'입장 유지'로 넘어가지 말고 반드시 답해야 한다.",
      inputSchema: {
        discussionId: z.string().describe(ROOM_ID),
        agent: agentSchema.describe("내가 누구인지"),
      },
    },
    async (args) => {
      try {
        return textResult(discussionService.claimTurn(args.discussionId, args.agent));
      } catch (err) {
        return errorResult(messageOf(err));
      }
    },
  );

  server.registerTool(
    "submit_discussion_turn",
    {
      title: "Submit Discussion Turn",
      description:
        "내 턴을 제출한다. 새로운 사실·코드·측정값·논리가 있을 때만 grounds=true로 발언하고, 없으면 " +
        "grounds=false로 두어라 — 같은 주장을 되풀이하는 대신 '입장 유지'로 표시되며 문서에는 아무것도 " +
        "쓰이지 않는다. body는 결론 한 줄과 근거 한두 줄로 짧게 쓴다. 상세한 분석은 문서 항목이 되고 " +
        "채팅에는 요약만 남는다. summaryDelta로 확인된 사실·합의·쟁점 갱신을 제안할 수 있고, 요약 블록은 " +
        "라운드의 모든 상세가 기록된 뒤 Router가 한 번만 붙인다. 같은 라운드에서 재시도해도 같은 항목이 " +
        "두 번 들어가지 않는다.",
      inputSchema: {
        discussionId: z.string().describe(ROOM_ID),
        agent: agentSchema.describe("내가 누구인지"),
        grounds: z.boolean().describe("새 근거가 있는가. false면 입장 유지"),
        body: z.string().optional().describe("결론 1줄 + 근거 1~2줄"),
        sources: z.array(z.string()).optional().describe("인용한 코드·문서 경로"),
        baseRevision: z.number().int().optional().describe("claim에서 받은 revision"),
        summaryDelta: z
          .object({
            facts: z.array(z.string()).optional(),
            agreed: z.array(z.string()).optional(),
            open: z.array(z.string()).optional(),
          })
          .optional()
          .describe("요약 갱신 제안. 생략하면 기존 요약이 유지된다"),
      },
    },
    async (args) => {
      try {
        const result = await discussionService.submitTurn(args.discussionId, {
          agent: args.agent,
          grounds: args.grounds,
          body: args.body,
          sources: args.sources,
          baseRevision: args.baseRevision,
          summaryDelta: args.summaryDelta,
        });
        return textResult({
          outcome: result.outcome,
          roundClosed: result.roundClosed,
          // Advisory, not fatal. Two details never contend — each is its own
          // block — but what the agent concluded may have been based on a
          // document that has since moved, and only the agent can judge that.
          stale: result.stale,
          staleNote: result.stale
            ? "제출 사이에 문서가 바뀌었다. 다시 읽고 의견을 조정할지 판단하라."
            : undefined,
          revision: result.discussion.revision,
          summaryVersion: result.discussion.summaryVersion,
        });
      } catch (err) {
        return errorResult(messageOf(err));
      }
    },
  );

  server.registerTool(
    "add_discussion_repo",
    {
      title: "Add Discussion Repository",
      description:
        "조사 범위에 저장소를 추가한다. 논의 중 필요한 저장소가 드러났을 때 쓰며, 새 문서를 만들지 않고 " +
        "기존 논의의 목록을 갱신한다. 등록되지 않은 저장소는 조사하지 않는다.",
      inputSchema: {
        discussionId: z.string().describe(ROOM_ID),
        repo: z.string().min(1).describe("추가할 저장소"),
      },
    },
    async (args) => {
      try {
        return textResult(await discussionService.addRepo(args.discussionId, args.repo));
      } catch (err) {
        return errorResult(messageOf(err));
      }
    },
  );
}
