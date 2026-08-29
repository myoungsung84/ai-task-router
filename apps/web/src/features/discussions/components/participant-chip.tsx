import { Pause } from "lucide-react";
import { AgentMark } from "@/features/agents/components/agent-character";
import { AGENT_LABEL } from "@/features/tasks/workflow-labels";
import type { AgentActivity } from "@/features/agents/agent-activity";
import { cn } from "@/lib/format";
import type { Participant, ParticipantState } from "@ai-task-router/shared";

/**
 * A participant in the room's header — the character, plus 입장 유지 when it
 * applies.
 *
 * 입장 유지 (§2) is drawn here and never posted. An AI that has stopped
 * finding new grounds is required to hold rather than restate, and a held
 * position published as a message would grow the very repetition the rule
 * exists to stop — twenty rooms-worth of "Codex: 입장 유지" scrolling past. On
 * the character it stays visible, costs no vertical space, and clears the
 * moment new evidence arrives.
 *
 * The badge is a wrapper rather than a sixth `AgentActivity`, because
 * AgentActivity is derived from Task Steps and holding has no meaning there.
 * When discussions gain a real backend, holding becomes an activity of its own
 * and this collapses into `AgentMark`.
 */

const TO_ACTIVITY: Record<ParticipantState, AgentActivity> = {
  idle: "idle",
  reading: "researching",
  writing: "writing",
  // Held positions are still, not busy — a ring here would read as work.
  holding: "idle",
};

export function ParticipantChip({ participant }: { participant: Participant }) {
  const { agent, state } = participant;
  const holding = state === "holding";

  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      title={
        holding ? `${AGENT_LABEL[agent]} · 입장 유지 (새 근거를 기다리는 중)` : AGENT_LABEL[agent]
      }
    >
      <span className={cn("relative flex", holding && "opacity-80")}>
        <AgentMark agent={agent} activity={TO_ACTIVITY[state]} size={24} />
        {holding ? (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-bg text-fg-faint ring-1 ring-border"
          >
            <Pause className="h-2 w-2" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      {holding ? <span className="hidden text-xs text-fg-faint lg:inline">입장 유지</span> : null}
    </span>
  );
}
