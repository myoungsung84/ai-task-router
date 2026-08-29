"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useTaskList } from "@/features/tasks/hooks/use-task-list";
import { useDailySummary } from "@/features/history/hooks/use-daily-summary";
import { useNowTick } from "@/features/tasks/hooks/use-now-tick";
import { AGENT_LABEL } from "@/features/tasks/workflow-labels";
import { statusGroupOf } from "@/features/tasks/types";
import { cn, formatDuration, kstDateString } from "@/lib/format";
import { deriveAgentPresence } from "../agent-activity";
import { ACTIVITY_LABEL, AgentMark } from "./agent-character";
import { ActivitySparkline } from "./activity-sparkline";

/**
 * The control tower: one always-visible row that states the whole workspace's
 * condition.
 *
 * It lives in the app header rather than as the dashboard's first section, and
 * that placement is the entire idea. A section scrolls away and is therefore a
 * card *about* status; a row pinned above every screen is an instrument you
 * glance at. It is also why this is allowed to be the one region of the app
 * that moves.
 *
 * Its second rule is that space is proportional to activity. The strip this
 * replaces reserved a full band to announce "할당된 작업 없음" twice, so the
 * page was at its largest with nothing happening. Idle here is a single line;
 * running work expands it, one row per busy Agent, and collapses again when
 * the work finishes.
 */

function todayKey(): string {
  return kstDateString(new Date());
}

/** "3시간 전" / "방금" — how long the workspace has been quiet. */
function sinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function ControlTower() {
  const { tasks, loading } = useTaskList();

  const stats = useMemo(() => {
    const today = todayKey();
    const running = tasks.filter((t) => t.status === "RUNNING" || t.status === "REVIEWING");
    const queued = tasks.filter((t) => t.status === "QUEUED");
    const attention = tasks.filter((t) => statusGroupOf(t.status) === "attention");
    const createdToday = tasks.filter((t) => kstDateString(new Date(t.createdAt)) === today);
    // Newest completion or start, whichever is more recent — "when did this
    // workspace last do anything", not "when was a Task created".
    const lastActivity = tasks
      .flatMap((t) => [t.completedAt, t.startedAt, t.createdAt])
      .filter((v): v is string => !!v)
      .sort()
      .pop();
    return { running, queued, attention, createdToday, lastActivity: lastActivity ?? null };
  }, [tasks]);

  const presence = useMemo(() => deriveAgentPresence(tasks), [tasks]);
  const busy = presence.filter((p) => p.active.length > 0);
  const live = stats.running.length > 0;

  // The daily digest the server already computes (narrative sentence, security
  // counts). It used to have its own dashboard card that reserved a block to
  // report an empty day; the numbers belong here, on the row that already
  // states the workspace's condition.
  const { summary } = useDailySummary(todayKey());
  const securityCount = (summary?.securityCritical ?? 0) + (summary?.securityHigh ?? 0);
  // Suppressed on an empty day: "오늘 생성된 Task가 없습니다" is exactly what the
  // "오늘 0건" counter beside it already says.
  const summaryLine = summary && summary.totalTasks > 0 ? summary.narrativeSummary : null;

  // Keeps the elapsed readouts moving while something is genuinely running.
  useNowTick(live);

  // Nothing is known yet — an empty tower is better than one asserting "대기 중"
  // about a workspace it has not loaded.
  if (loading && tasks.length === 0) return null;

  return (
    <div
      className={cn(
        "border-b transition-colors duration-base",
        live ? "border-brand/25 bg-brand/[0.04]" : "border-border bg-fg/[0.015]",
      )}
    >
      <div className="mx-auto w-full max-w-content px-4 sm:px-6">
        {/* Summary line — always present, in both states. */}
        <div className="flex h-10 items-center gap-3 text-xs">
          <span className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 rounded-full",
                live ? "bg-brand" : "agent-breathe bg-fg-faint",
              )}
            />
            <span className={cn("font-medium", live ? "text-fg" : "text-fg-muted")}>
              {live
                ? `${stats.running.length}건 실행 중`
                : stats.queued.length > 0
                  ? `${stats.queued.length}건 대기열`
                  : "대기 중"}
            </span>
          </span>

          {!live && stats.lastActivity ? (
            <span className="hidden shrink-0 text-fg-faint sm:inline">
              마지막 작업 {sinceLabel(stats.lastActivity)}
            </span>
          ) : null}

          <span className="hidden shrink-0 text-fg-faint md:inline">
            오늘 <span className="mono text-fg-muted">{stats.createdToday.length}</span>건
          </span>

          {/*
            Today's server-computed digest, folded into this row rather than
            given a card of its own. As a card it spent a whole block saying
            "0 Task" on a quiet morning; here it takes the space it has and
            truncates, so a busy day says more and a quiet one says nothing.
          */}
          {summaryLine ? (
            <span className="hidden min-w-0 flex-1 truncate text-fg-faint lg:inline">
              {summaryLine}
            </span>
          ) : null}

          <span className="ml-auto flex shrink-0 items-center gap-3">
            {/* Security findings outrank the digest text they came from — the
                one part of a daily summary worth interrupting for. */}
            {securityCount > 0 ? (
              <Link
                href="/?filter=attention"
                className="flex items-center gap-1.5 rounded-full bg-danger/12 px-2.5 py-1 font-medium text-danger transition-colors duration-fast hover:bg-danger/20"
              >
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                Security {securityCount}
              </Link>
            ) : null}
            {stats.attention.length > 0 ? (
              <Link
                href="/?filter=attention"
                className="flex items-center gap-1.5 rounded-full bg-danger/12 px-2.5 py-1 font-medium text-danger transition-colors duration-fast hover:bg-danger/20"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                확인 필요 {stats.attention.length}
              </Link>
            ) : null}
            <span className="hidden sm:block">
              <ActivitySparkline tasks={tasks} />
            </span>
          </span>
        </div>

        {/* Expansion — one row per Agent actually mid-Step. */}
        {busy.length > 0 ? (
          <div className="grid gap-1 pb-2 sm:grid-cols-2">
            {busy.map((p) => {
              const focus = p.active[0]!;
              return (
                <Link
                  key={p.agent}
                  href={`/tasks/${focus.jobId}`}
                  className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-fast hover:bg-fg/[0.05]"
                >
                  <AgentMark agent={p.agent} activity={p.activity} size={28} />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-fg">{AGENT_LABEL[p.agent]}</span>
                      <span className="text-fg-muted">{ACTIVITY_LABEL[p.activity]}</span>
                      {p.active.length > 1 ? (
                        <span className="mono text-fg-faint">+{p.active.length - 1}</span>
                      ) : null}
                    </span>
                    <span className="flex min-w-0 items-baseline gap-1.5 text-xs">
                      <span className="mono shrink-0 text-fg-faint">{focus.jobId}</span>
                      <span className="min-w-0 truncate text-fg-secondary">{focus.title}</span>
                    </span>
                  </span>
                  <span className="mono ml-auto shrink-0 text-xs text-fg-muted">
                    {focus.startedAt ? formatDuration(focus.startedAt, null) : ""}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
