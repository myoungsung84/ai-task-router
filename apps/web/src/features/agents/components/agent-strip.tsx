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
  columns,
  /** Right-hand slot for a caller's own summary (e.g. a running count). */
  action,
}: {
  tasks: TaskListItem[];
  agents?: AgentName[];
  className?: string;
  label?: string;
  /** See `AgentPresenceRow` — the caller declares its own width, not a breakpoint. */
  columns?: 1 | 2;
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
        columns={columns}
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
 *
 * **The caller declares the column count, because only the caller knows how
 * wide it is.** This was `sm:grid-cols-2`, and a Tailwind breakpoint measures
 * the *viewport* — so on any desktop it put two characters side by side even
 * inside the Task detail sidebar, leaving each about 145px. A character needs
 * roughly 62px of that for its badge and padding, and what was left could not
 * hold "Claude 대기 중": Korean breaks between syllables, so the label came
 * out as 대/기/중 stacked vertically. Two columns is a statement about the
 * container, and the container is the one thing a breakpoint cannot see.
 */
export function AgentPresenceRow({
  presence,
  onSelect,
  className,
  /** 1 unless the caller has the width for two. Never widened automatically. */
  columns = 1,
}: {
  presence: AgentPresence[];
  onSelect?: (taskId: string) => void;
  className?: string;
  columns?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-lg bg-fg/[0.035] p-2",
        columns === 2 && presence.length > 1 ? "sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {presence.map((p) => (
        <AgentCharacter key={p.agent} presence={p} onSelect={onSelect} />
      ))}
    </div>
  );
}
