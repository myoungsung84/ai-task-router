import { FileText, CornerDownRight } from "lucide-react";
import { AgentMark } from "@/features/agents/components/agent-character";
import { AGENT_LABEL } from "@/features/tasks/workflow-labels";
import { cn, formatTime } from "@/lib/format";
import type { DiscussionMessage } from "@ai-task-router/shared";

/**
 * One posted message.
 *
 * The AI's mark is drawn by `AgentMark` at `idle` rather than by a fresh
 * avatar: a posted message is finished work, and the ring states are reserved
 * for the character that is actually mid-turn in the compose rail below. Two
 * characters both looking busy — one of them only because it spoke a minute
 * ago — is the failure this avoids.
 *
 * A corrected message stays exactly where it was written (§8: 이전 발언을
 * 삭제하지 않고). It goes quiet and grows a pointer forward, so the thread of
 * how an opinion changed is still readable in order — which is the whole
 * reason the proposal forbids deleting it.
 *
 * The link out is `상세 #47`, and it can be a permanent anchor because the
 * document is append-only: entry 47 never moves, so a message written today
 * still points at the right paragraph a hundred appends later.
 */
export function ChatMessage({ message }: { message: DiscussionMessage }) {
  const amended = !!message.amendedBy;
  // Aliased against a const binding so the ternaries below narrow `author`
  // down to an AgentName on the else branch.
  const { author } = message;
  const isUser = author === "user";

  return (
    <article className={cn("flex gap-3", amended && "opacity-60")}>
      <div className="shrink-0 pt-0.5">
        {isUser ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fg/[0.07] text-xs font-medium text-fg-muted">
            나
          </span>
        ) : (
          <AgentMark agent={author} activity="idle" size={32} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-fg">{isUser ? "나" : AGENT_LABEL[author]}</span>
          <span className="mono text-xs text-fg-faint">{formatTime(message.at)}</span>
          {amended ? <span className="text-xs text-fg-faint">· 이후 정정됨</span> : null}
        </p>

        {/* Conclusion line, then grounds — the body is authored with the split
            already in it, so the first line carries the weight visually. */}
        <div className="mt-1 space-y-0.5">
          {message.body.split("\n").map((line, i) => (
            <p key={i} className={cn("text-sm", i === 0 ? "text-fg-secondary" : "text-fg-muted")}>
              {line}
            </p>
          ))}
        </div>

        {message.entryRef !== null || message.sources?.length ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {message.entryRef !== null ? (
              <button
                type="button"
                className="flex items-center gap-1 text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <FileText className="h-3 w-3" aria-hidden />
                상세 #{message.entryRef}
              </button>
            ) : null}
            {message.sources?.map((s) => (
              <span key={s} className="mono truncate text-fg-faint">
                {s}
              </span>
            ))}
          </p>
        ) : null}

        {amended ? (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-fg-faint">
            <CornerDownRight className="h-3 w-3" aria-hidden />
            아래에서 의견을 바꿨습니다
          </p>
        ) : null}
      </div>
    </article>
  );
}
