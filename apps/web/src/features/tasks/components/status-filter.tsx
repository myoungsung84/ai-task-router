import { cn } from "@/lib/format";

export type MainFilter = "active" | "attention" | "done" | "all";

const OPTIONS: { value: MainFilter; label: string }[] = [
  { value: "active", label: "작업 중" },
  { value: "attention", label: "확인 필요" },
  { value: "done", label: "완료" },
  { value: "all", label: "전체" },
];

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
    <div className="inline-flex rounded-lg border border-[#232c38] bg-[#0e131a] p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === opt.value ? "bg-white/10 text-white" : "text-[#8291a3] hover:text-white",
          )}
        >
          {opt.label}
          <span className="mono ml-1.5 text-xs text-[#546274]">{counts[opt.value]}</span>
        </button>
      ))}
    </div>
  );
}
