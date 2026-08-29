import { kstDateString } from "@/lib/format";
import type { TaskListItem } from "@/features/tasks/types";

/**
 * Fourteen days of Task volume as one small bar strip.
 *
 * It exists for the quiet case. With nothing running, the dashboard used to be
 * completely motionless and completely blank — which reads as broken rather
 * than as idle. A strip showing that yesterday had three Tasks and today has
 * none gives silence a context, and it costs no request: the shared Task list
 * already carries every `createdAt` the strip needs.
 */
const DAYS = 14;

function dayKeys(): string[] {
  const out: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(kstDateString(d));
  }
  return out;
}

export function ActivitySparkline({ tasks }: { tasks: TaskListItem[] }) {
  const keys = dayKeys();
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const task of tasks) {
    const key = kstDateString(new Date(task.createdAt));
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }

  const values = keys.map((k) => counts.get(k) ?? 0);
  const peak = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <span
      className="flex h-5 items-end gap-[2px]"
      role="img"
      aria-label={`최근 ${DAYS}일 작업 ${total}건`}
      title={`최근 ${DAYS}일 · ${total}건`}
    >
      {values.map((v, i) => {
        const isToday = i === values.length - 1;
        return (
          <span
            key={keys[i]}
            // A floor of 2px so an empty day still draws a baseline tick —
            // a gap would read as missing data rather than as a quiet day.
            style={{ height: `${v === 0 ? 2 : Math.max(3, Math.round((v / peak) * 20))}px` }}
            className={
              v === 0
                ? "w-[3px] rounded-sm bg-fg/15"
                : isToday
                  ? "w-[3px] rounded-sm bg-brand"
                  : "w-[3px] rounded-sm bg-fg/35"
            }
          />
        );
      })}
    </span>
  );
}
