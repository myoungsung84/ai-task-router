"use client";

import { useMemo, useState } from "react";
import { Card, SectionLabel } from "@/components/card";
import { Badge } from "@/components/badge";
import { LoadingState } from "@/components/states";
import { kstDateString } from "@/lib/format";
import { useDailySummary } from "../hooks/use-daily-summary";

type QuickRange = "today" | "yesterday" | "custom";

/** One small "N건" chip — omitted entirely by the caller when its count is 0, so a quiet day's row stays short instead of a wall of zeroes. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1 text-xs">
      <span className="mono font-medium text-fg">{value}</span>
      <span className="text-fg-muted">{label}</span>
    </span>
  );
}

/**
 * Dashboard-top "오늘 요약" — a Daily History/Digest aggregation, deliberately
 * minimal: Today/Yesterday/date-picker to switch day, one narrative sentence,
 * and a row of stat chips (only for counts that are actually non-zero). No
 * calendar UI, no per-Task breakdown — the Task list right below this already
 * shows individual Tasks.
 */
export function TodaySummary() {
  const today = useMemo(() => kstDateString(new Date()), []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return kstDateString(d);
  }, []);

  const [range, setRange] = useState<QuickRange>("today");
  const [customDate, setCustomDate] = useState(today);
  const date = range === "today" ? today : range === "yesterday" ? yesterday : customDate;

  const { summary, loading, error } = useDailySummary(date);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>오늘 요약</SectionLabel>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRange("today")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              range === "today" ? "bg-brand/10 text-brand" : "text-fg-muted hover:text-fg"
            }`}
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => setRange("yesterday")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              range === "yesterday" ? "bg-brand/10 text-brand" : "text-fg-muted hover:text-fg"
            }`}
          >
            어제
          </button>
          <input
            type="date"
            value={customDate}
            max={today}
            onChange={(e) => {
              setCustomDate(e.target.value);
              setRange("custom");
            }}
            className={`mono rounded-md border px-2 py-1 text-xs ${
              range === "custom" ? "border-brand/60 text-brand" : "border-border text-fg-muted"
            }`}
          />
        </div>
      </div>

      <Card variant="outline" padding="sm">
        {loading ? (
          <LoadingState padding="sm" className="justify-start" />
        ) : error || !summary ? (
          <p className="text-sm text-danger">{error ?? "요약을 불러오지 못했습니다."}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-fg-secondary">{summary.narrativeSummary}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <Stat label="Task" value={summary.totalTasks} />
              {summary.completed > 0 ? <Stat label="완료" value={summary.completed} /> : null}
              {summary.needsAttention > 0 ? (
                <Stat label="확인 필요" value={summary.needsAttention} />
              ) : null}
              {summary.failed > 0 ? <Stat label="실패" value={summary.failed} /> : null}
              {summary.claudeRuns > 0 ? (
                <Stat label="Claude 실행" value={summary.claudeRuns} />
              ) : null}
              {summary.codexReviews > 0 ? (
                <Stat label="Codex 리뷰" value={summary.codexReviews} />
              ) : null}
              {summary.autoFixRuns > 0 ? (
                <Stat label="자동 수정" value={summary.autoFixRuns} />
              ) : null}
              {summary.changedFilesCount > 0 ? (
                <Stat label="변경 파일" value={summary.changedFilesCount} />
              ) : null}
              {summary.securityCritical > 0 ? (
                <Badge tone="danger">Security Critical {summary.securityCritical}</Badge>
              ) : null}
              {summary.securityHigh > 0 ? (
                <Badge tone="danger">Security High {summary.securityHigh}</Badge>
              ) : null}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
