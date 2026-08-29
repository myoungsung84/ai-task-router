"use client";

import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/format";
import { StatusFilter, type MainFilter } from "./status-filter";
import { TaskSearchBar } from "./task-search-bar";
import { DateRangePicker } from "./date-range-picker";
import { DEFAULT_RANGE, resolvePreset, type DateRange } from "../date-range";

/**
 * Every Task filter in one row, with one grammar.
 *
 * They used to be split across two regions that governed different things —
 * a date picker in the page header and 상태/검색/프로젝트 above the list — which
 * is how the summary and the list ended up describing different days. All four
 * now sit together and combine with AND.
 *
 * There is deliberately no row of "active filter" chips. Every control here
 * already displays its own state — the segmented control highlights 완료, the
 * range button reads "최근 7일", the select shows the project, the input holds
 * the query — so chips restated what was visible one line above them, and the
 * row appearing and disappearing bounced the whole list vertically on every
 * filter change. Reset lives inline instead, where it costs no height.
 */

export interface TaskFilters {
  status: MainFilter;
  search: string;
  project: string;
  range: DateRange;
}

export function defaultFilters(): TaskFilters {
  return { status: "all", search: "", project: "", range: resolvePreset(DEFAULT_RANGE) };
}

/** Whether anything is narrowed — the only thing the removed chip row actually added. */
function isFiltered(filters: TaskFilters): boolean {
  return (
    filters.status !== "all" ||
    filters.search.trim() !== "" ||
    filters.project !== "" ||
    filters.range.preset !== DEFAULT_RANGE
  );
}

export function TaskFilterBar({
  filters,
  onChange,
  counts,
  projectOptions,
  className,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  counts: Record<MainFilter, number>;
  projectOptions: string[];
  className?: string;
}) {
  const filtered = isFiltered(filters);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <StatusFilter
        value={filters.status}
        onChange={(status) => onChange({ ...filters, status })}
        counts={counts}
      />
      <div className="flex flex-wrap items-center gap-2">
        <TaskSearchBar
          search={filters.search}
          onSearchChange={(search) => onChange({ ...filters, search })}
          project={filters.project}
          onProjectChange={(project) => onChange({ ...filters, project })}
          projectOptions={projectOptions}
        />
        <DateRangePicker
          value={filters.range}
          onChange={(range) => onChange({ ...filters, range })}
        />
        {/*
          Kept in the DOM at all times and only made invisible, so appearing
          and disappearing can never change this row's height or shuffle the
          controls beside it — the bounce that the old chip row caused.
        */}
        <button
          type="button"
          onClick={() => onChange(defaultFilters())}
          aria-hidden={!filtered}
          tabIndex={filtered ? 0 : -1}
          title="필터 초기화"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-fast",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            filtered
              ? "text-fg-muted hover:bg-fg/[0.06] hover:text-fg"
              : "pointer-events-none opacity-0",
          )}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
