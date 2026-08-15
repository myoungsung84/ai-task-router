import type { TaskListItem } from "../types";
import { statusGroupOf } from "../types";

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function StatusSummary({ tasks }: { tasks: TaskListItem[] }) {
  const active = tasks.filter((t) => statusGroupOf(t.status) === "active").length;
  const attention = tasks.filter((t) => statusGroupOf(t.status) === "attention").length;
  const doneToday = tasks.filter(
    (t) => statusGroupOf(t.status) === "done" && isToday(t.completedAt),
  ).length;

  const items: { label: string; value: number; tone: string }[] = [
    { label: "작업 중", value: active, tone: "text-blue-300" },
    { label: "확인 필요", value: attention, tone: "text-amber-300" },
    { label: "오늘 완료", value: doneToday, tone: "text-emerald-300" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-[#232c38] bg-[#121821] px-4 py-3">
          <div className="text-xs text-[#8291a3]">{item.label}</div>
          <div className={`mono mt-1 text-2xl font-semibold ${item.tone}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
