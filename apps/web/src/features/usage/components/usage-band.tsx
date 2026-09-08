"use client";

import type { AgentUsage, UsageWindow } from "@ai-task-router/shared";
import { AgentIcon } from "@/components/agent-icon";
import { HoverTip } from "@/components/hover-tip";
import { cn } from "@/lib/format";
import { useUsage } from "../hooks/use-usage";
import {
  ageHours,
  formatObservedAt,
  formatPercent,
  formatResetAt,
  formatTokens,
  formatWindowLabel,
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
 * it belongs in the control tower instead, not in this band. That has already
 * had to be enforced once: per-model limits arrived as a disclosure under the
 * rows, and because their number varies the band grew a third line whose only
 * content was a count. They are a `+N` badge on their agent's name now, with
 * the numbers in its tooltip.
 *
 * Every column is aligned across the two rows so the two accounts can be
 * compared by scanning straight down. That is a constraint on anything added
 * here, not a description of one arrangement — reading each agent's windows out
 * in its own order breaks it, because the CLIs do not agree on which window
 * comes first. See `windowColumns`.
 */

/** Track/fill widths are fixed so the percentage column lines up between rows. */
const BAR_SEGMENTS = 8;

/** Explicit width so a window a plan does not have can hold the gauge's space without drawing one. */
const METER_CLASS = "flex w-[2.875rem] shrink-0 items-center gap-[2px]";

/**
 * The four slots of one window, and the gap between them.
 *
 * Collected here because the row's rhythm depends on them agreeing, and it
 * had stopped: the percentage slot was widened to hold 미확인 and, being
 * right-aligned, opened a hole between the bar and the number that no other
 * pair in the row had. Right alignment stays — it is what lets the two rows'
 * numbers be compared straight down — so the slot is only as wide as its
 * widest value instead.
 */
const CELL_CLASS = "flex items-center gap-1.5";
const PERCENT_CLASS = "mono w-11 text-right";
const RESET_CLASS = "mono hidden w-[4.75rem] md:inline";

/** The agent name column. Wide enough for the longest name plus a `+N` badge. */
const NAME_CLASS = "flex w-24 shrink-0 items-center gap-1.5";

/**
 * A window shorter than this belongs in the first column, longer in the second.
 *
 * The two CLIs do not agree on the order they report windows in: this
 * account's Claude reports a 5-hour window first and its Codex a 7-day one. So
 * rendering `primary` then `secondary` put 5 hours directly above 7 days and
 * invited exactly the comparison this band exists to make. Placing each window
 * by its own reported length keeps the labels honest *and* the columns
 * comparable, and an agent with no window of that length leaves the cell
 * empty — which is itself the truth about that plan.
 */
const SHORT_WINDOW_MAX_MINUTES = 1440;

/** The two windows in fixed [짧은 창, 긴 창] columns, either of which may be absent. */
function windowColumns(
  primary: UsageWindow | null,
  secondary: UsageWindow | null,
): [UsageWindow | null, UsageWindow | null] {
  let short: UsageWindow | null = null;
  let long: UsageWindow | null = null;

  for (const window of [primary, secondary]) {
    if (!window) continue;
    const minutes = window.windowMinutes;
    const isShort = minutes !== null && minutes < SHORT_WINDOW_MAX_MINUTES;
    // A window whose length the CLI never reported cannot be placed by length,
    // so it takes whichever column is still free rather than being dropped.
    if (isShort ? !short : !long) {
      if (isShort) short = window;
      else long = window;
    } else if (!short) short = window;
    else if (!long) long = window;
  }

  return [short, long];
}

/** What each `accountMatch` value means, in the row's own words. */
const ACCOUNT_MATCH_DETAIL: Record<AgentUsage["accountMatch"], string | null> = {
  VERIFIED: null,
  UNVERIFIABLE: "한도 기록에 계정 정보가 없어 현재 계정의 것인지 확인하지 못했습니다",
  MISMATCHED: "다른 계정에서 기록된 한도입니다",
};

/** Border and text colour for a `+N` badge, from the worst window it covers. */
function badgeClass(peakPercent: number): string {
  if (peakPercent >= 80) return "border-danger/40 text-danger";
  if (peakPercent >= 50) return "border-warning/40 text-warning";
  return "border-border-strong text-fg-muted";
}

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
      <span className={NAME_CLASS}>
        <Block className="w-3.5" />
        <Block className="w-12" />
      </span>
      <Block className="w-40 shrink-0" />
      <span className="flex items-center gap-x-6">
        <Block className="w-[7.5rem]" />
        <Block className="hidden w-[7.5rem] sm:block" />
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-x-4">
        <Block className="hidden w-16 lg:block" />
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

/**
 * The gauge. An empty track means "no reading", never "0% used".
 *
 * Those used to look identical — a window that could not be read and a window
 * genuinely untouched both drew an empty bar — so a failed read was
 * indistinguishable from good news. Only a real percentage fills anything now,
 * and the number beside it reads 미확인 when there is none.
 */
function Meter({ percent }: { percent: number | null }) {
  const filled = percent === null ? 0 : Math.round((percent / 100) * BAR_SEGMENTS);

  return (
    <span aria-hidden className={METER_CLASS}>
      {Array.from({ length: BAR_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2.5 w-1 rounded-[1px]",
            percent !== null && i < filled ? heatClass(percent) : "bg-fg/[0.12]",
          )}
        />
      ))}
    </span>
  );
}

/**
 * One plan window: how long it is, how much of it is used, when it resets.
 *
 * The label is rendered from the window's own reported length, not from which
 * field it arrived in. The percentage shown is the *used* share; the remaining
 * share and the wording that says which is which live in the row's own tip,
 * because a cell of its own tooltip is what made two of them fire at once.
 */
function WindowCell({ window }: { window: UsageWindow | null }) {
  // No window of this length on this plan. It holds the column's width so the
  // rows still line up, and draws nothing: an empty gauge beside a number is
  // how "0% used" looks, and this is not that.
  if (!window) {
    return (
      <span className={CELL_CLASS}>
        <span className="w-4 shrink-0" />
        {/* The dash sits in the gauge's slot, not the percentage's. In the
            percentage slot it had the empty label and empty reset-time slots
            on either side of it and read as a stray mark between two other
            things; here it lands where the other row's bar is. */}
        <span aria-hidden className={cn(METER_CLASS, "justify-center text-fg-faint")}>
          –
        </span>
        <span className={cn(PERCENT_CLASS, "shrink-0")} />
        <span className={cn(RESET_CLASS, "shrink-0")} />
      </span>
    );
  }

  const percent = window.usedPercent;

  return (
    <span className={CELL_CLASS}>
      <span className="w-4 shrink-0 text-fg-faint">{formatWindowLabel(window.windowMinutes)}</span>
      <Meter percent={percent} />
      <span
        className={cn(PERCENT_CLASS, "shrink-0", percent !== null ? "text-fg" : "text-fg-faint")}
      >
        {formatPercent(percent)}
      </span>
      {/*
        The reset moment, in the quiet colour. There are three times on this
        row and only one of them is ever urgent, so they are all held back a
        step and the percentages carry the row.
      */}
      <span className={cn(RESET_CLASS, "shrink-0 text-fg-faint")}>
        {window.expired ? "리셋됨" : formatResetAt(window.resetsAt)}
      </span>
    </span>
  );
}

/**
 * A reading taken hours ago is still the truth about the window it describes,
 * so it is shown rather than hidden — but Claude's snapshot only refreshes
 * while an interactive session renders its status line, so a day away from
 * Claude Code leaves a genuinely old number on screen. Fading is how the row
 * admits that without dropping the value.
 *
 * It pairs with the wall-clock time at the end of the row: the fade is what
 * you notice without looking, the time is what you check once you have. That
 * column was briefly cut to make room for the per-model badge, and putting the
 * badge on the agent's name gave the width back.
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
  const [shortWindow, longWindow] = windowColumns(usage.primary, usage.secondary);
  // Marked on the account rather than in a column of its own. What is
  // unverified is "these limits belong to this account", so the account is the
  // thing to qualify — and a text chip out in the row costs width for a label
  // that on some plans never changes.
  const accountNote = ACCOUNT_MATCH_DETAIL[usage.accountMatch];

  /**
   * Per-model limits, behind the `+N` badge on this agent's name.
   *
   * They were a disclosure under the band for one revision, and that was the
   * wrong place by this file's own rule: their number varies (an account may
   * report none), so the band grew a permanent third line to announce a count
   * and, expanded, a nameless row that read as a third agent. Nor is the
   * control tower an option — it is one line, always, by its own contract.
   *
   * The model name and its numbers go on separate lines. A native tooltip
   * wraps at its own width wherever it likes, and one long line came out
   * broken mid-item ("5h 0% ·" / "7d 0%").
   */
  const extraLimits = usage.additionalLimits ?? [];
  const extraLimitLines = extraLimits.flatMap((limit) => {
    const [short, long] = windowColumns(limit.primary, limit.secondary);
    const parts = [short, long]
      .filter((window): window is UsageWindow => window !== null)
      .map(
        (window) =>
          `${formatWindowLabel(window.windowMinutes)} ${formatPercent(window.usedPercent)}`,
      );
    return [limit.label, `  ${parts.join(" · ") || "미확인"}`];
  });
  // The badge takes its colour from the *worst* per-model window, so a model
  // being throttled while the account limit is barely touched is visible
  // without opening anything. That case is the only reason these numbers are
  // worth surfacing at all.
  const extraLimitPeak = extraLimits.reduce((peak, limit) => {
    for (const window of [limit.primary, limit.secondary]) {
      if (window?.usedPercent != null) peak = Math.max(peak, window.usedPercent);
    }
    return peak;
  }, 0);
  const extraLimitTip = (
    <>
      <span className="block font-medium text-fg">모델별 한도</span>
      {extraLimitLines.join("\n")}
    </>
  );

  /**
   * Everything the row states in short form, spelled out — on the agent's
   * name, and nowhere else.
   *
   * There used to be a `title` on the row itself and another on every window
   * cell. Pointing at the `+N` badge is also pointing at the row, so both
   * fired and the browser's caption landed on top of this app's panel. One
   * trigger per area is the rule that avoids that: the name text and the
   * badge are siblings, so hovering either shows exactly one thing.
   */
  const detailTip = (
    <>
      <span className="block font-medium text-fg">
        {name}
        {account?.plan ? ` · ${account.plan}` : ""}
      </span>
      {[
        account?.email ? `계정 ${account.email}` : null,
        account?.organization ? `조직 ${account.organization}` : null,
        accountNote,
        ...[shortWindow, longWindow]
          .filter((w): w is UsageWindow => w !== null)
          .map((w) => {
            const label = formatWindowLabel(w.windowMinutes);
            const reset = w.expired
              ? `초기화됨 (${formatResetAt(w.resetsAt)} 지남)`
              : `초기화 ${formatResetAt(w.resetsAt)}`;
            return `${label} 창 · 사용률 ${formatPercent(w.usedPercent)} · 잔여 ${formatPercent(w.remainingPercent)} · ${reset}`;
          }),
        usage.todayTokens !== null
          ? `오늘 토큰 ${formatTokens(usage.todayTokens)}${
              usage.todayTokensScope === "LOCAL_ALL_SESSIONS"
                ? " · 이 PC 의 모든 로컬 세션 합계 (계정 한도와 다른 지표)"
                : ""
            }`
          : null,
        `판독 ${formatObservedAt(usage.observedAt)}`,
        usage.unavailable,
      ]
        .filter(Boolean)
        .join("\n")}
    </>
  );

  return (
    <div className={ROW_CLASS}>
      {/* The badge sits on the agent's name, not out by the windows. Appended
          after the last window it landed right after a reset timestamp, and
          "09/15 10:23 +1" reads as an offset on the time — no amount of
          spacing fixes that, because the neighbour was the problem. Here its
          neighbour is the thing it is about: this agent has limits beyond the
          two on the row. The name carries the tooltip and `cursor-help`, so
          there is an obvious place to point at. */}
      <div className={cn(NAME_CLASS, "font-medium text-fg")}>
        <AgentIcon
          agent={usage.agent}
          size={13}
          className={usage.agent === "claude" ? "text-agent-claude" : "text-agent-codex"}
        />
        <HoverTip label={`${name} 사용량 상세`} tip={detailTip}>
          {name}
        </HoverTip>
        {extraLimits.length > 0 ? (
          <HoverTip
            label={`모델별 한도 ${extraLimits.length}건`}
            tip={extraLimitTip}
            className={cn(
              "mono shrink-0 rounded border px-1 text-[0.6875rem] font-normal leading-[1.1]",
              badgeClass(extraLimitPeak),
            )}
          >
            +{extraLimits.length}
          </HoverTip>
        ) : null}
      </div>

      {/* Who, then what plan — the two accounts are different providers under
          different subscriptions, so the row says which one it is reporting on
          rather than leaving that to a hover. The account half is absent
          whenever the server did not read one (Codex's is behind
          USAGE_SHOW_ACCOUNT), and then the plan simply moves left rather than
          sitting after a placeholder dash for something nobody asked to see. */}
      <div className="flex w-40 shrink-0 items-center gap-1.5 overflow-hidden">
        {label ? <span className="truncate text-fg-secondary">{label}</span> : null}
        {label && account?.plan ? (
          <span aria-hidden className="text-fg-faint">
            ·
          </span>
        ) : null}
        {account?.plan ? <span className="shrink-0 text-fg-muted">{account.plan}</span> : null}
        {!label && !account?.plan ? <span className="text-fg-faint">-</span> : null}
        {accountNote ? (
          <HoverTip label="계정 확인 상태" tip={accountNote} className="shrink-0 text-fg-faint">
            ?
          </HoverTip>
        ) : null}
      </div>

      {usage.unavailable && !usage.primary && !usage.secondary ? (
        <span className="min-w-0 flex-1 truncate text-fg-faint">{usage.unavailable}</span>
      ) : (
        <span className={cn("flex items-center gap-x-6", stalenessClass(usage.observedAt))}>
          <WindowCell window={shortWindow} />
          <span className="hidden sm:flex">
            <WindowCell window={longWindow} />
          </span>
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-x-4">
        {/* The figure alone, with T for tokens. Both words it used to carry
            were cut on request — 로컬 first, then 오늘 — and each had been
            making the row's longest phrase out of its least urgent fact. What
            the number counts is in the row's detail tip. */}
        <span className="hidden lg:inline">
          <span className="mono text-fg">{formatTokens(usage.todayTokens)}</span>
          <span className="ml-0.5 text-fg-faint">T</span>
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
