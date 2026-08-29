import { cn } from "@/lib/format";
import { AGENT_LABEL } from "@/features/tasks/workflow-labels";
import type { AgentName } from "@/features/tasks/types";
import { COMPOSE_STAGES, COMPOSE_STAGE_LABEL, type ComposeStage } from "../types";

/**
 * One AI's turn, drawn with the same milestone grammar as a Task's StepTrack:
 * a groove across the full width, equal segments, a sweep on the live one, and
 * no fraction claimed anywhere.
 *
 * A sibling of StepTrack rather than a call into it — that component's nodes
 * are Steps, coloured per Agent and captioned with durations, while these five
 * belong to a single AI and never vary. Unifying them would mean a rail that
 * takes either shape, which is more abstraction than two callers earn. If a
 * third rail turns up, that is the moment to merge them; the visual rules are
 * deliberately identical so the merge stays cheap.
 *
 * The 시작 node is here for the same reason it is there: without it the first
 * stage would be full the instant the turn began.
 *
 * What this rail buys beyond decoration is that its first node is literally
 * 문서 읽음. The proposal's §2 promises that an AI answers from the source
 * document rather than from the chat above it, and that promise is otherwise
 * invisible — a claim in a spec that the screen never has to keep. Drawn, the
 * user watches it happen.
 */

const AGENT_DOT: Record<AgentName, string> = {
  claude: "bg-agent-claude",
  codex: "bg-agent-codex",
};

const AGENT_TEXT: Record<AgentName, string> = {
  claude: "text-agent-claude",
  codex: "text-agent-codex",
};

type NodeState = "done" | "running" | "pending";

function stateOf(stage: ComposeStage, current: ComposeStage): NodeState {
  const at = COMPOSE_STAGES.indexOf(current);
  const i = COMPOSE_STAGES.indexOf(stage);
  if (i < at) return "done";
  if (i === at) return "running";
  return "pending";
}

export function ComposeTrack({
  agent,
  stage,
  className,
}: {
  agent: AgentName;
  stage: ComposeStage;
  className?: string;
}) {
  // The synthetic 시작 node, then the five fixed stages.
  const nodes: { key: string; label: string; state: NodeState }[] = [
    { key: "__start", label: "시작", state: "done" },
    ...COMPOSE_STAGES.map((s) => ({
      key: s,
      label: COMPOSE_STAGE_LABEL[s],
      state: stateOf(s, stage),
    })),
  ];

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border bg-fg/[0.02] px-3 py-2.5",
        className,
      )}
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs">
        <span className={cn("font-medium", AGENT_TEXT[agent])}>{AGENT_LABEL[agent]}</span>
        <span className="text-fg-muted">작성 중</span>
      </p>

      <div className="relative flex h-3 items-center">
        <span aria-hidden className="absolute inset-x-0 h-[3px] rounded-full bg-fg/[0.09]" />
        <div className="relative flex w-full items-center">
          {nodes.map((n, i) => (
            <div
              key={n.key}
              className={cn("flex items-center", i === 0 ? "shrink-0" : "min-w-0 flex-1")}
            >
              {i > 0 ? (
                <span
                  className={cn(
                    "h-[3px] min-w-0 flex-1 overflow-hidden rounded-full",
                    n.state === "done"
                      ? "bg-fg/30"
                      : n.state === "running"
                        ? "bg-fg/12"
                        : "bg-fg/[0.08]",
                  )}
                >
                  {n.state === "running" ? (
                    <span
                      aria-hidden
                      className="scan-sweep block h-full w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                    />
                  ) : null}
                </span>
              ) : null}
              {n.state === "running" ? (
                <span className="relative z-10 flex h-2 w-2 shrink-0 items-center justify-center">
                  <span
                    className={cn(
                      "absolute inset-0 animate-ping rounded-full opacity-60",
                      AGENT_DOT[agent],
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn("relative h-2 w-2 rounded-full ring-2 ring-bg", AGENT_DOT[agent])}
                  />
                </span>
              ) : (
                <span
                  className={cn(
                    "z-10 h-2 w-2 shrink-0 rounded-full",
                    n.state === "done" ? "bg-fg/40" : "bg-fg/15 ring-2 ring-bg",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 flex items-start">
        {nodes.map((n, i) => (
          <div
            key={n.key}
            className={cn(
              "flex min-w-0",
              i === 0 ? "shrink-0 justify-start" : "flex-1 justify-end",
            )}
          >
            <span
              className={cn(
                "truncate text-xs leading-tight",
                n.state === "running"
                  ? cn("font-medium", AGENT_TEXT[agent])
                  : n.state === "done"
                    ? "text-fg-muted"
                    : "text-fg-faint",
              )}
            >
              {n.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
