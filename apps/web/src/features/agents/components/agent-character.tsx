import { AgentIcon } from "@/components/agent-icon";
import { AGENT_LABEL } from "@/features/tasks/workflow-labels";
import { cn } from "@/lib/format";
import type { AgentActivity, AgentPresence } from "../agent-activity";

/**
 * One AI, drawn as a character rather than as a status badge.
 *
 * The point of this component is that **the state lives in the avatar**. The
 * app already had `AgentAvatar` (mark in a tinted circle) with a separate
 * `Badge` next to it saying what was happening — which reads as a label, not
 * as someone working. Here the mark itself bobs, an orbit ring sweeps around
 * it, and the tint tracks the activity, so "Claude is mid-implement" is
 * legible before any text is read.
 *
 * It keeps the existing `AgentIcon` glyphs on purpose: the mark is Claude and
 * Codex's identity everywhere else in the app, and swapping it for an
 * illustrated sprite is a change to this file alone (the ring, motion and
 * layout below make no assumption about what sits in the middle).
 */

export const ACTIVITY_LABEL: Record<AgentActivity, string> = {
  idle: "대기 중",
  researching: "분석 중",
  writing: "구현 중",
  reviewing: "리뷰 중",
  error: "문제 발생",
};

/**
 * Activity → ring treatment. `idle` deliberately has no ring at all rather
 * than a grey one: absence of a ring is what makes the busy states legible at
 * a glance across a row of characters.
 */
const RING_CLASS: Record<AgentActivity, string | null> = {
  idle: null,
  researching: "border-info/70 border-dashed agent-orbit",
  writing: "border-brand/70 border-dashed agent-orbit-slow",
  reviewing: "border-reviewing/70 border-dashed agent-orbit-slow",
  error: "border-danger/70",
};

/** Motion applied to the mark itself, layered under the ring's own animation. */
const MARK_MOTION: Record<AgentActivity, string | null> = {
  idle: "agent-breathe",
  researching: null,
  writing: "agent-bob",
  reviewing: null,
  error: "agent-flinch",
};

const AGENT_TEXT: Record<AgentPresence["agent"], string> = {
  claude: "text-agent-claude",
  codex: "text-agent-codex",
};

const AGENT_WASH: Record<AgentPresence["agent"], string> = {
  claude: "bg-agent-claude/15",
  codex: "bg-agent-codex/15",
};

/** Three dots under a writing character — the existing `typing-dot` keyframe, reused so all "producing output" motion in the app shares one rhythm. */
function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-[3px]", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot h-1 w-1 rounded-full bg-current" />
      ))}
    </span>
  );
}

/**
 * The mark + its activity ring, with no text. Split out so the same character
 * can appear at strip size and inline in a dense row (a Task's own timeline,
 * a discussion message) without those callers re-deriving ring/motion classes.
 */
export function AgentMark({
  agent,
  activity,
  size = 44,
  className,
}: {
  agent: AgentPresence["agent"];
  activity: AgentActivity;
  size?: number;
  className?: string;
}) {
  const ring = RING_CLASS[activity];
  const motion = MARK_MOTION[activity];
  const dimmed = activity === "idle";

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Ring sits outside the badge so its rotation never drags the glyph
          around with it — the character stays upright while the ring sweeps. */}
      {ring ? (
        <span className={cn("absolute inset-0 rounded-full border-2", ring)} aria-hidden />
      ) : null}
      <span
        className={cn(
          "flex items-center justify-center rounded-full transition-colors duration-base",
          AGENT_WASH[agent],
          AGENT_TEXT[agent],
          dimmed && "opacity-70 saturate-50",
          motion,
        )}
        style={{ width: size - 10, height: size - 10 }}
      >
        <AgentIcon agent={agent} size={Math.round((size - 10) * 0.52)} />
      </span>
    </span>
  );
}

/**
 * A character plus what it is doing and what it is doing it to.
 *
 * `detail` is the one line that keeps the strip honest — a character that
 * looks busy but can't say what it's busy with is decoration. When an Agent
 * is running several Steps at once (the normal case for this tool) the
 * newest is named and the rest are counted, rather than listing all of them
 * and making the strip grow taller as the day gets busier.
 */
export function AgentCharacter({
  presence,
  onSelect,
}: {
  presence: AgentPresence;
  /** Called with the Task the character is currently naming, when there is one. */
  onSelect?: (taskId: string) => void;
}) {
  const { agent, activity, active, failed } = presence;
  const focus = active[0] ?? failed[0] ?? null;
  const extra = Math.max(active.length - 1, 0);

  const detail = focus ? (
    <span className="truncate">
      <span className="mono text-fg-muted">{focus.jobId}</span>
      <span className="text-fg-faint"> · </span>
      <span className="text-fg-secondary">{focus.title}</span>
    </span>
  ) : (
    <span className="text-fg-faint">할당된 작업 없음</span>
  );

  const body = (
    <>
      <AgentMark agent={agent} activity={activity} />
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-fg">{AGENT_LABEL[agent]}</span>
          <span className={cn("text-xs", activity === "error" ? "text-danger" : "text-fg-muted")}>
            {ACTIVITY_LABEL[activity]}
          </span>
          {activity === "writing" ? <TypingDots className="text-brand" /> : null}
          {extra > 0 ? <span className="mono text-xs text-fg-faint">+{extra}</span> : null}
        </span>
        <span className="flex w-full min-w-0 text-xs">{detail}</span>
      </span>
    </>
  );

  const shared = "flex min-w-0 items-center gap-3 rounded-md p-2 text-left";

  // Only clickable when there is somewhere to go — an idle character is not a
  // dead button, it simply isn't a button.
  if (!focus || !onSelect) {
    return <div className={shared}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(focus.taskId)}
      className={cn(
        shared,
        "transition-colors duration-fast hover:bg-fg/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
      )}
      title={`${focus.jobId} 열기`}
    >
      {body}
    </button>
  );
}
