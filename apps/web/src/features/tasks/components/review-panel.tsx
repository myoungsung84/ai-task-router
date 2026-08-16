import { Lightbulb } from "lucide-react";
import { Card } from "@/components/card";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/format";
import { reviewOutcomeToText } from "../lib/task-copy-text";
import { SEVERITY_LABEL } from "../workflow-labels";
import type { ReviewOutcome } from "../types";

const SEVERITY_WASH: Record<string, string> = {
  high: "bg-danger/[0.06]",
  medium: "bg-warning/[0.07]",
  low: "bg-fg/[0.03]",
};

const SEVERITY_TEXT: Record<string, string> = {
  high: "text-danger",
  medium: "text-warning",
  low: "text-fg-muted",
};

/** Renders one `review`-action Step's outcome. A Task's workflow can (in principle) include more than one review Step, so the caller maps over them and passes a `title` distinguishing each. */
export function ReviewPanel({ title, review }: { title: string; review: ReviewOutcome | null }) {
  if (!review) {
    return (
      <Card eyebrow={title}>
        <p className="text-sm text-fg-muted">아직 리뷰가 수행되지 않았습니다.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* The title is what distinguishes one review step from another
              when a workflow runs more than one — it has to render in the
              normal (non-empty) case too, not only in the placeholder. */}
          <span className="text-sm font-medium text-fg">{title}</span>
          <Badge tone={review.result === "PASS" ? "success" : "warning"}>{review.result}</Badge>
          <span className="text-xs text-fg-muted">
            {review.issues.length > 0 ? `지적 ${review.issues.length}건` : "지적 사항 없음"}
          </span>
        </div>
        <CopyButton text={reviewOutcomeToText(review)} label="리뷰 복사" />
      </div>

      {review.issues.length > 0 ? (
        <ul className="space-y-2">
          {review.issues.map((issue, idx) => (
            <li
              key={idx}
              className={cn("rounded-md px-3 py-3 text-sm", SEVERITY_WASH[issue.severity])}
            >
              <div
                className={cn(
                  "mb-1 flex flex-wrap items-center gap-2 text-xs font-medium",
                  SEVERITY_TEXT[issue.severity],
                )}
              >
                <span>{SEVERITY_LABEL[issue.severity] ?? issue.severity}</span>
                {issue.file ? (
                  <span className="mono text-fg-faint">
                    {issue.file}
                    {issue.location ? `:${issue.location}` : ""}
                  </span>
                ) : null}
              </div>
              <div className="text-fg-secondary">{issue.message}</div>
              {issue.suggestion ? (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-success">
                  <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {issue.suggestion}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
