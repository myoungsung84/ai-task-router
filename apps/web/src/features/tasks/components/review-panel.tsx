import { Card } from "@/components/card";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/format";
import { reviewOutcomeToText } from "../lib/task-copy-text";
import { SEVERITY_LABEL } from "../workflow-labels";
import type { ReviewOutcome } from "../types";

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-red-500/40 bg-red-600/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-600/10 text-amber-300",
  low: "border-slate-500/40 bg-slate-600/10 text-slate-300",
};

/** Renders one `review`-action Step's outcome. A Task's workflow can (in principle) include more than one review Step, so the caller maps over them and passes a `title` distinguishing each. */
export function ReviewPanel({ title, review }: { title: string; review: ReviewOutcome | null }) {
  if (!review) {
    return (
      <Card title={title}>
        <p className="text-sm text-[#8291a3]">아직 리뷰가 수행되지 않았습니다.</p>
      </Card>
    );
  }

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span>{title}</span>
          <CopyButton text={reviewOutcomeToText(review)} label="리뷰 복사" />
        </div>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-medium",
            review.result === "PASS"
              ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-600/10 text-amber-300",
          )}
        >
          {review.result}
        </span>
        <span className="text-xs text-[#8291a3]">
          {review.issues.length > 0 ? `${review.issues.length}건 발견` : "발견된 문제 없음"}
        </span>
      </div>

      {review.issues.length > 0 ? (
        <ul className="space-y-2">
          {review.issues.map((issue, idx) => (
            <li
              key={idx}
              className={cn("rounded-md border px-3 py-2 text-sm", SEVERITY_STYLE[issue.severity])}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide">
                <span className="rounded border border-current/40 px-1.5 py-0.5">
                  {SEVERITY_LABEL[issue.severity] ?? issue.severity}
                </span>
                {issue.file ? (
                  <span className="mono normal-case">
                    {issue.file}
                    {issue.location ? `:${issue.location}` : ""}
                  </span>
                ) : null}
              </div>
              <div>{issue.message}</div>
              {issue.suggestion ? (
                <div className="mt-2 rounded border-l-2 border-emerald-500/40 bg-emerald-500/5 px-2 py-1.5 text-xs text-emerald-200">
                  💡 제안: {issue.suggestion}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
