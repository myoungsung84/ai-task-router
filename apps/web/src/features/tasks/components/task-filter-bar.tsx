"use client";

import { cn } from "@/lib/format";
import { StatusFilter, type MainFilter } from "./status-filter";
import { TaskSearchBar } from "./task-search-bar";
import { DateRangePicker } from "./date-range-picker";
import { DEFAULT_RANGE, resolvePreset, type DateRange } from "../date-range";

/**
 * Every Task filter in one row, with one grammar.
 *
 * They used to be split across two regions that governed different things — a
 * date picker in the page header and 상태/검색/프로젝트 above the list — which is
 * how the summary and the list ended up describing different days. All four now
 * sit together and combine with AND.
 *
 * Two things this row deliberately does not have.
 *
 * No "active filter" chips: every control already displays its own state — the
 * segmented control highlights 완료, the range button reads "최근 7일", the
 * select shows the project, the input holds the query — so chips restated what
 * was visible one line above them, and the row appearing and disappearing
 * bounced the whole list vertically on each filter change.
 *
 * No reset-all button either. It read as a refresh control (a circular arrow,
 * the same glyph this app uses for 재실행 on the Task detail screen) for
 * something that refreshes itself, and each control can already be returned to
 * its own default in one interaction.
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
      </div>
    </div>
  );
}
