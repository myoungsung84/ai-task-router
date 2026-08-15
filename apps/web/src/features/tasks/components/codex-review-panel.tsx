import { Card } from "@/components/card";
import { cn } from "@/lib/format";
import type { CodexReviewResult } from "../types";

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-red-500/40 bg-red-600/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-600/10 text-amber-300",
  low: "border-slate-500/40 bg-slate-600/10 text-slate-300",
};

export function CodexReviewPanel({ review }: { review: CodexReviewResult | null }) {
  if (!review) {
    return (
      <Card title="Codex 리뷰 결과">
        <p className="text-sm text-[#8291a3]">아직 리뷰가 수행되지 않았습니다.</p>
      </Card>
    );
  }

  return (
    <Card title="Codex 리뷰 결과">
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
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide">
                <span>{issue.severity}</span>
                {issue.file ? <span className="mono normal-case">{issue.file}</span> : null}
              </div>
              <div>{issue.message}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
