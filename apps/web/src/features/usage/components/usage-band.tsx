"use client";

import type { AgentUsage, UsageWindow } from "@ai-task-router/shared";
import { AgentIcon } from "@/components/agent-icon";
import { cn } from "@/lib/format";
import { useUsage } from "../hooks/use-usage";
import {
  ageHours,
  formatObservedAt,
  formatResetAt,
  formatTokens,
  shortAccount,
} from "../lib/format-usage";

/**
 * Plan limits and today's token totals for both CLIs, as two horizontal lines
 * above the Task list.
 *
 * This sits where the old AI-team band and 오늘 요약 card used to, and those
 * were removed for a reason worth restating: each of them reserved a block to
 * announce that nothing had happened, so the page looked emptiest exactly when
 * it had least to say. This band does not have that failure mode. A plan limit
 * always has a value — 0% is as real a reading as 45%, and it is still worth
 * seeing when no Task is running at all. That is the whole justification for
 * putting a band back here; if a future row is ever added that *can* be empty,
 * it belongs in the control tower instead, not in this band.
 *
 * Every column is aligned across the two rows so the two accounts can be
 * compared by scanning straight down.
 */

/** Track/fill widths are fixed so the percentage column lines up between rows. */
const BAR_SEGMENTS = 8;

/**
 * The one row shell, shared by the loaded row and its placeholder.
 *
 * The fixed height is the point of it. Without a height of its own the row is
 * as tall as whatever text happens to be in it, so a placeholder built from
 * grey blocks came out a few pixels shorter and the whole Task list below
 * twitched upward the moment real data arrived. Pinning both to the same height
 * is what makes the band appear without moving anything.
 */
const ROW_CLASS = "flex h-6 items-center gap-x-4 overflow-hidden whitespace-nowrap text-xs";

/** A grey stand-in block, sized per column so the skeleton lines up with the real row. */
function Block({ className }: { className: string }) {
  return <span className={cn("h-2.5 rounded-sm bg-fg/[0.09]", className)} />;
}

/**
 * The band before the first response.
 *
 * Rendered instead of nothing at all: returning null meant the dashboard drew
 * the Task list at the top of the page and then shoved it down a frame later,
 * which is the nod this replaces. It mirrors the real row's columns, including
 * their responsive visibility, so the layout does not shift at any width
 * either.
 */
function SkeletonRow() {
  return (
    <div className={ROW_CLASS} aria-hidden>
      <span className="flex w-[5.5rem] shrink-0 items-center gap-1.5">
        <Block className="w-3.5" />
        <Block className="w-12" />
      </span>
      <Block className="w-[10.5rem] shrink-0" />
      <span className="flex items-center gap-x-6">
        <Block className="w-[7.5rem]" />
        <Block className="hidden w-[7.5rem] sm:block" />
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-x-5">
        <Block className="hidden w-20 lg:block" />
        <Block className="hidden w-[6.5rem] md:block" />
      </span>
    </div>
  );
}

function heatClass(percent: number): string {
  if (percent >= 80) return "bg-danger";
  if (percent >= 50) return "bg-warning";
  return "bg-success";
}

function Meter({ window }: { window: UsageWindow | null }) {
  const percent = window ? Math.min(100, Math.max(0, window.usedPercent)) : 0;
  const filled = Math.round((percent / 100) * BAR_SEGMENTS);

  return (
    <span aria-hidden className="flex items-center gap-[2px]">
      {Array.from({ length: BAR_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2.5 w-1 rounded-[1px]",
            window && i < filled ? heatClass(percent) : "bg-fg/[0.12]",
          )}
        />
      ))}
    </span>
  );
}

function WindowCell({ label, window }: { label: string; window: UsageWindow | null }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-fg-faint">{label}</span>
      <Meter window={window} />
      <span className={cn("mono w-9 shrink-0 text-right", window ? "text-fg" : "text-fg-faint")}>
        {window ? `${Math.round(window.usedPercent)}%` : "-"}
      </span>
      {/*
        The reset moment, in the quiet colour. There are three times on this
        row and only one of them is ever urgent, so they are all held back a
        step and the percentages carry the row.
      */}
      <span className="mono hidden w-[4.75rem] shrink-0 text-fg-faint md:inline">
        {window?.expired ? "리셋됨" : formatResetAt(window?.resetsAt ?? null)}
      </span>
    </span>
  );
}

/**
 * A reading taken hours ago is still the truth about the window it describes,
 * so it is shown rather than hidden — but Codex only records its limits while
 * it runs, so an untouched day leaves a genuinely old number on screen. Fading
 * it is how the row admits that without dropping the value.
 */
function stalenessClass(observedAt: string | null): string {
  const hours = ageHours(observedAt);
  if (hours === null) return "opacity-60";
  if (hours >= 24) return "opacity-50";
  if (hours >= 1) return "opacity-80";
  return "";
}

function AgentRow({ usage }: { usage: AgentUsage }) {
  const name = usage.agent === "claude" ? "Claude" : "Codex";
  const account = usage.account;
  const label = shortAccount(account?.email ?? null);
  // The row carries a short account label; the full address, the organization
  // and the reset moments live here, where confirming exactly which login is
  // in use does not cost the row a column.
  const tooltip = [
    account?.email ? `계정 ${account.email}` : null,
    account?.organization ? `조직 ${account.organization}` : null,
    usage.fiveHour ? `5시간 창 리셋 ${formatResetAt(usage.fiveHour.resetsAt)}` : null,
    usage.sevenDay ? `7일 창 리셋 ${formatResetAt(usage.sevenDay.resetsAt)}` : null,
    usage.unavailable,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div title={tooltip || undefined} className={ROW_CLASS}>
      <span className="flex w-[5.5rem] shrink-0 items-center gap-1.5 font-medium text-fg">
        <AgentIcon
          agent={usage.agent}
          size={13}
          className={usage.agent === "claude" ? "text-agent-claude" : "text-agent-codex"}
        />
        {name}
      </span>

      {/* Who, then what plan — the two accounts are different providers under
          different subscriptions, so the row says which one it is reporting on
          rather than leaving that to a hover. The account half is absent
          whenever the server did not read one (Codex's is behind
          USAGE_SHOW_ACCOUNT), and then the plan simply moves left rather than
          sitting after a placeholder dash for something nobody asked to see. */}
      <span className="flex w-[10.5rem] shrink-0 items-center gap-1.5 overflow-hidden">
        {label ? <span className="truncate text-fg-secondary">{label}</span> : null}
        {label && account?.plan ? (
          <span aria-hidden className="text-fg-faint">
            ·
          </span>
        ) : null}
        {account?.plan ? <span className="shrink-0 text-fg-muted">{account.plan}</span> : null}
        {!label && !account?.plan ? <span className="text-fg-faint">-</span> : null}
      </span>

      {usage.unavailable && !usage.fiveHour && !usage.sevenDay ? (
        <span className="min-w-0 flex-1 truncate text-fg-faint">{usage.unavailable}</span>
      ) : (
        <span className={cn("flex items-center gap-x-6", stalenessClass(usage.observedAt))}>
          <WindowCell label="5h" window={usage.fiveHour} />
          <span className="hidden sm:flex">
            <WindowCell label="7d" window={usage.sevenDay} />
          </span>
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-x-5">
        <span className="hidden text-fg-muted lg:inline">
          오늘 <span className="mono text-fg">{formatTokens(usage.todayTokens)}</span> tok
        </span>
        <span
          className={cn(
            "mono hidden w-[6.5rem] text-right text-fg-faint md:inline",
            stalenessClass(usage.observedAt),
          )}
        >
          {formatObservedAt(usage.observedAt)}
        </span>
      </span>
    </div>
  );
}

export function UsageBand() {
  const { snapshot, error } = useUsage();

  return (
    <section
      aria-label="AI 사용량"
      className="mb-4 rounded-lg border border-border bg-surface px-4 py-1.5"
    >
      {snapshot ? (
        <>
          <AgentRow usage={snapshot.claude} />
          <AgentRow usage={snapshot.codex} />
        </>
      ) : error ? (
        // A failed read still holds both rows' worth of space. The band is an
        // accessory and its failure must not move the list underneath it any
        // more than its arrival does.
        <>
          <div className={cn(ROW_CLASS, "text-fg-faint")}>사용량을 불러오지 못했습니다</div>
          <div className={ROW_CLASS} />
        </>
      ) : (
        <div className="motion-safe:animate-pulse">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}
    </section>
  );
}
