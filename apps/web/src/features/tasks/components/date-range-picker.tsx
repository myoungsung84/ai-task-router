"use client";

import { CalendarRange, ChevronDown } from "lucide-react";
import { Popover } from "@/components/popover";
import { cn, kstDateString } from "@/lib/format";
import {
  RANGE_LABEL,
  RANGE_PRESETS,
  describeRange,
  resolvePreset,
  type DateRange,
} from "../date-range";

/**
 * The Task list's 기간 filter — a preset list with a 직접 지정 pair underneath,
 * in the same toolbar row as 상태/검색/프로젝트 so all four filters read as one
 * set that combines, rather than one control stranded in the page header
 * (where the date used to live, governing a different region than the filters
 * beside the list did).
 */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  className?: string;
}) {
  const today = kstDateString(new Date());
  const active = value.preset !== "30d";

  return (
    <Popover
      align="end"
      panelClassName="w-64 p-1.5"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors duration-fast",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            active
              ? "border-brand/50 bg-brand/[0.07] text-fg"
              : "border-border bg-fg/[0.03] text-fg-muted hover:border-border-strong hover:text-fg",
            className,
          )}
        >
          <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{describeRange(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <div className="space-y-1">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                onChange(resolvePreset(preset));
                close();
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors duration-fast",
                value.preset === preset
                  ? "bg-brand/10 text-brand"
                  : "text-fg-secondary hover:bg-fg/[0.06] hover:text-fg",
              )}
            >
              {RANGE_LABEL[preset]}
              {preset === "30d" && value.preset !== preset ? (
                <span className="text-xs text-fg-faint">기본</span>
              ) : null}
            </button>
          ))}

          {/* Editing either date is what selects 직접 지정 — there is no separate
              "custom" option to pick first and then fill in. */}
          <div className="mt-1 space-y-1.5 border-t border-border px-2.5 pb-1 pt-2">
            <span className="block text-xs font-medium text-fg-muted">직접 지정</span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label="시작일"
                max={value.to ?? today}
                value={value.from ?? ""}
                onChange={(e) =>
                  onChange({
                    preset: "custom",
                    from: e.target.value || null,
                    to: value.to ?? today,
                  })
                }
                className="mono h-8 min-w-0 flex-1 rounded-md border border-border bg-fg/[0.03] px-2 text-xs text-fg"
              />
              <span className="shrink-0 text-xs text-fg-faint">~</span>
              <input
                type="date"
                aria-label="종료일"
                min={value.from ?? undefined}
                max={today}
                value={value.to ?? ""}
                onChange={(e) =>
                  onChange({ preset: "custom", from: value.from, to: e.target.value || null })
                }
                className="mono h-8 min-w-0 flex-1 rounded-md border border-border bg-fg/[0.03] px-2 text-xs text-fg"
              />
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
}
