import { kstDateString } from "@/lib/format";
import { statusGroupOf } from "./types";
import type { TaskListItem } from "./types";

/**
 * The Task list's time filter.
 *
 * A *range*, not a single day. The dashboard previously scoped to one date at
 * a time, which meant the default view went empty the moment a day passed
 * without work — a workspace that looks abandoned every quiet morning. Thirty
 * days is the default because that is roughly "recent work I might still be
 * thinking about"; narrower views are one click away.
 */
export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "all" | "custom";

export const DEFAULT_RANGE: RangePreset = "30d";

export const RANGE_LABEL: Record<RangePreset, string> = {
  today: "오늘",
  yesterday: "어제",
  "7d": "최근 7일",
  "30d": "최근 30일",
  all: "전체 기간",
  custom: "직접 지정",
};

/** Presets offered in the picker, in order. `custom` is reached by editing the dates rather than by picking it. */
export const RANGE_PRESETS: RangePreset[] = ["today", "yesterday", "7d", "30d", "all"];

export interface DateRange {
  preset: RangePreset;
  /** Inclusive KST day bounds. `null` means unbounded on that side. */
  from: string | null;
  to: string | null;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return kstDateString(d);
}

/** Resolves a preset to concrete inclusive bounds, evaluated against "now". */
export function resolvePreset(preset: RangePreset): DateRange {
  const today = kstDateString(new Date());
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "yesterday": {
      const y = daysAgo(1);
      return { preset, from: y, to: y };
    }
    case "7d":
      return { preset, from: daysAgo(6), to: today };
    case "30d":
      return { preset, from: daysAgo(29), to: today };
    case "all":
      return { preset, from: null, to: null };
    case "custom":
      return { preset, from: today, to: today };
  }
}

/** Human-readable summary of a range, for the picker's trigger button. */
export function describeRange(range: DateRange): string {
  if (range.preset !== "custom") return RANGE_LABEL[range.preset];
  if (range.from && range.to)
    return range.from === range.to ? range.from : `${range.from} ~ ${range.to}`;
  if (range.from) return `${range.from} ~`;
  if (range.to) return `~ ${range.to}`;
  return RANGE_LABEL.all;
}

/**
 * Whether a Task falls inside the range, by the KST day it was created.
 *
 * 진행 중 Tasks are never excluded. A QUEUED Task older than the window is
 * still waiting to run, and hiding work that has not happened yet behind a
 * filter about when work *did* happen is how a queue silently strands
 * something. This is the only exemption, and it is one-way: a range can widen
 * what is shown, never hide something still live.
 */
export function isWithinRange(task: TaskListItem, range: DateRange): boolean {
  if (statusGroupOf(task.status) === "active") return true;
  const day = kstDateString(new Date(task.createdAt));
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}
