import type { AgentName, StepAction, TaskListItem } from "@/features/tasks/types";

/**
 * What an Agent is visibly doing right now.
 *
 * Derived entirely from Tasks the client already holds — there is no
 * "agent presence" endpoint and no extra socket. Every Task (including the
 * list view, see `TaskListItem`) carries its full `workflow.steps[]`, and a
 * Step already names its `agent`, its `action` and its `status`. Presence is
 * therefore a pure projection of data on screen, which means it can never
 * drift out of sync with the Task rows sitting right below it.
 *
 * The vocabulary is deliberately about *observable behaviour* ("reading",
 * "writing") rather than about the domain's own `StepAction` names: this is
 * the layer that decides what a character does, and a character reads a
 * document — it does not "analyze".
 */
export type AgentActivity = "idle" | "researching" | "writing" | "reviewing" | "error";

/**
 * The one mapping from what the system calls a Step to what a character is
 * seen doing. `analyze` and `review` are both read-only in the domain, but
 * they are kept apart here because they answer different questions for the
 * person watching — "it is looking things up" vs "it is checking my work".
 */
const ACTION_ACTIVITY: Record<StepAction, Exclude<AgentActivity, "idle" | "error">> = {
  analyze: "researching",
  implement: "writing",
  review: "reviewing",
};

/** One Task an Agent is attached to, flattened to just what the strip renders. */
export interface AgentAssignment {
  taskId: string;
  jobId: string;
  title: string;
  action: StepAction;
  startedAt: string | null;
}

export interface AgentPresence {
  agent: AgentName;
  activity: AgentActivity;
  /**
   * Steps this Agent is running *right now*, newest first. Parallel execution
   * across projects is the whole point of this tool, so this is a list rather
   * than a single "current task" — one Agent genuinely can be mid-implement on
   * three repos at once.
   */
  active: AgentAssignment[];
  /**
   * Tasks that failed on this Agent's own Step and are still sitting in
   * FAILED. Scoped to *unresolved* failures on purpose: a character stuck
   * looking upset over something the user fixed an hour ago is noise, so this
   * clears as soon as the Task leaves FAILED.
   */
  failed: AgentAssignment[];
}

/** Most recently started first; a Step with no `startedAt` sorts last. */
function byNewest(a: AgentAssignment, b: AgentAssignment): number {
  if (a.startedAt === b.startedAt) return 0;
  if (!a.startedAt) return 1;
  if (!b.startedAt) return -1;
  return b.startedAt.localeCompare(a.startedAt);
}

/**
 * Live work wins over a past failure, and a failure over nothing: the strip's
 * job is to answer "what is happening" before "what went wrong", and an Agent
 * that is busy again has visibly moved on from the failure.
 */
function activityOf(active: AgentAssignment[], failed: AgentAssignment[]): AgentActivity {
  if (active.length > 0) return ACTION_ACTIVITY[active[0].action];
  if (failed.length > 0) return "error";
  return "idle";
}

/**
 * Projects Tasks onto one entry per Agent — always every Agent in `agents`,
 * in that order, even when it has nothing to do. The strip is a fixed cast of
 * characters whose *states* change; rows appearing and disappearing as work
 * starts would make the layout jump and would lose the "the team is here,
 * this one is resting" reading that makes `idle` worth showing at all.
 */
export function deriveAgentPresence(
  tasks: TaskListItem[],
  agents: AgentName[] = ["claude", "codex"],
): AgentPresence[] {
  const active = new Map<AgentName, AgentAssignment[]>();
  const failed = new Map<AgentName, AgentAssignment[]>();
  for (const agent of agents) {
    active.set(agent, []);
    failed.set(agent, []);
  }

  for (const task of tasks) {
    for (const step of task.workflow?.steps ?? []) {
      const bucket =
        step.status === "RUNNING"
          ? active.get(step.agent)
          : step.status === "FAILED" && task.status === "FAILED"
            ? failed.get(step.agent)
            : undefined;
      // `undefined` covers both "not a state we show" and an Agent outside
      // `agents` (e.g. a Step stored by a build that knew a third runner).
      if (!bucket) continue;
      bucket.push({
        taskId: task.id,
        jobId: task.jobId,
        title: task.title,
        action: step.action,
        startedAt: step.startedAt,
      });
    }
  }

  return agents.map((agent) => {
    const activeFor = (active.get(agent) ?? []).sort(byNewest);
    const failedFor = (failed.get(agent) ?? []).sort(byNewest);
    return {
      agent,
      activity: activityOf(activeFor, failedFor),
      active: activeFor,
      failed: failedFor,
    };
  });
}

/** True when anything in the cast is mid-Step — drives "should this poll faster / animate at all". */
export function anyAgentBusy(presence: AgentPresence[]): boolean {
  return presence.some((p) => p.active.length > 0);
}
