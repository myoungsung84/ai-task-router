"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { SectionLabel } from "@/components/card";
import type { AgentName, TaskListItem } from "@/features/tasks/types";
import { cn } from "@/lib/format";
import { deriveAgentPresence, type AgentPresence } from "../agent-activity";
import { AgentCharacter } from "./agent-character";

/**
 * The AI team, shown as characters at work.
 *
 * This is the one region of the app allowed to feel alive — everything below
 * it (Task rows, logs, diffs) stays deliberately still. Concentrating the
 * motion here is what lets the app read as "a place where AI teammates work"
 * without costing the readability the rest of the screens are built for.
 *
 * It renders a fixed cast: both Agents are always present, resting or not.
 * Rows appearing and disappearing as work starts would make the page jump and
 * would lose "the team is here, this one is free" — which is exactly the
 * question this strip exists to answer at a glance.
 */
export function AgentStrip({
  tasks,
  agents,
  className,
  label = "AI 팀",
  /** Right-hand slot for a caller's own summary (e.g. a running count). */
  action,
}: {
  tasks: TaskListItem[];
  agents?: AgentName[];
  className?: string;
  label?: string;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  // Presence is a pure projection, but it walks every Step of every Task —
  // cheap, yet re-run on each poll tick, so it is memoised against the array
  // the poller swaps in rather than recomputed on unrelated re-renders.
  const presence = useMemo(() => deriveAgentPresence(tasks, agents), [tasks, agents]);

  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{label}</SectionLabel>
        {action}
      </div>
      <AgentPresenceRow
        presence={presence}
        onSelect={(taskId) => router.push(`/tasks/${taskId}`)}
      />
    </section>
  );
}

/**
 * The characters themselves, without the section chrome — for callers that
 * already have presence (or already have a heading) and just want the row.
 *
 * A grid rather than a flex row so both characters get the same width and
 * the second one's "지금 뭐 하는 중" line starts at a predictable x position;
 * with flex, a long Task title on the left would shove the right-hand
 * character around on every poll.
 */
export function AgentPresenceRow({
  presence,
  onSelect,
  className,
}: {
  presence: AgentPresence[];
  onSelect?: (taskId: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-lg bg-fg/[0.035] p-2",
        presence.length > 1 ? "sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {presence.map((p) => (
        <AgentCharacter key={p.agent} presence={p} onSelect={onSelect} />
      ))}
    </div>
  );
}
