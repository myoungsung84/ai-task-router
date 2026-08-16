import { cn } from "@/lib/format";

export type MainFilter = "active" | "attention" | "done" | "all";

const OPTIONS: { value: MainFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "진행 중" },
  { value: "attention", label: "확인 필요" },
  { value: "done", label: "완료" },
];

/**
 * A segmented control — one of the two places in this app that keeps a pill
 * shape (see globals.css "Shape"), because the enclosing track is what says
 * "these four are one mutually-exclusive choice". Same 36px height as the
 * search field and project select beside it, so the whole toolbar sits on
 * one line.
 */
export function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: MainFilter;
  onChange: (v: MainFilter) => void;
  counts: Record<MainFilter, number>;
}) {
  return (
    <div className="inline-flex h-9 items-center gap-0.5 rounded-full bg-fg/[0.05] p-0.5">
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              active ? "bg-surface-raised text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            {opt.label}
            <span className={cn("mono text-xs", active ? "text-fg-muted" : "text-fg-faint")}>
              {counts[opt.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
