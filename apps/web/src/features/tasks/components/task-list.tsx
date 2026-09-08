"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTaskList } from "../hooks/use-task-list";
import { tasksApi } from "../api/tasks-api";
import type { MainFilter } from "./status-filter";
import {
  TaskFilterBar,
  TaskFilterBarSkeleton,
  defaultFilters,
  type TaskFilters,
} from "./task-filter-bar";
import { TaskListHeader, TaskRow, TaskRowSkeleton } from "./task-row";
import { ActiveTaskCard } from "./active-task-card";
import { NewTaskModal } from "./new-task-modal";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { useToast } from "@/components/toast";
import { projectName } from "@/lib/format";
import { describeRange, isWithinRange } from "../date-range";
import { statusGroupOf } from "../types";
import {
  ATTENTION_REASON_LABEL,
  attentionReasonOf,
  type AttentionReason,
} from "../workflow-labels";
import type { TaskListItem } from "../types";

/**
 * How many placeholder rows the loading list draws.
 *
 * A centred spinner used to sit here, and it was the wrong shape: it occupied
 * about two rows' worth of height and then the real table replaced it, so the
 * column header and the first rows landed somewhere other than where the
 * spinner had been. Drawing the actual header plus a few rows puts them in
 * their final position from the first frame.
 *
 * Six rather than a screenful on purpose. Overshooting would make the list
 * *shrink* when a workspace holds fewer Tasks than the placeholder promised,
 * and a list that collapses upward on arrival is the same jolt as one that
 * grows downward — except a workspace with more Tasks than this simply extends
 * past the fold, which nobody sees happen.
 */
const SKELETON_ROWS = 6;

function ListSkeleton() {
  return (
    <div className="motion-safe:animate-pulse">
      <TaskListHeader />
      <div className="divide-y divide-border">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <TaskRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * What the dashboard renders while `TaskList` itself is still suspended.
 *
 * `TaskList` reads `useSearchParams()`, so the server ships this fallback's
 * markup and the component only takes over at hydration. That handoff is a
 * second place the page could jolt: a spinner here and a skeleton there meant
 * the list moved once before any data had even been requested. This mirrors the
 * loading state exactly — same heading, same bar height, same container, same
 * rows — so the first paint and the first client render are the same picture.
 */
export function TaskListFallback() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-fg">작업</h1>
      </div>
      <TaskFilterBarSkeleton />
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <ListSkeleton />
      </div>
    </div>
  );
}

const SECTION_LABEL: Record<"active" | "attention" | "done", string> = {
  active: "진행 중",
  attention: "확인 필요",
  done: "완료",
};

// Display order for the "확인 필요" section's reason breakdown — Security
// findings first (they're the most urgent), then the same order as before.
const ATTENTION_REASON_ORDER: AttentionReason[] = [
  "SECURITY_CRITICAL",
  "SECURITY_HIGH",
  "REVIEW_NEEDS_FIX",
  "REVIEW_FAILED",
  "EXECUTION_FAILED",
];

/** "리뷰 수정 필요 2 · 실행 실패 1" — omits any reason with zero Tasks. `null` when nothing to break down (e.g. a lone Task, or reasons not yet derivable). */
function attentionBreakdownText(items: TaskListItem[]): string | null {
  const counts: Partial<Record<AttentionReason, number>> = {};
  for (const t of items) {
    const reason = attentionReasonOf(t);
    if (reason) counts[reason] = (counts[reason] ?? 0) + 1;
  }
  const parts = ATTENTION_REASON_ORDER.filter((r) => counts[r]).map(
    (r) => `${ATTENTION_REASON_LABEL[r]} ${counts[r]}`,
  );
  return parts.length > 1 ? parts.join(" · ") : null;
}

/**
 * Everything that did not itself animate still has to get out of the way, and
 * by default it does so by teleporting: the 진행 중 heading disappears the
 * instant its last card leaves, and — when that leaves one group standing —
 * `showSectionLabels` flips and every remaining heading vanishes at once, so
 * the whole list below snaps upward in a single frame.
 *
 * Standard FLIP fixes it. Measure where each row was, let React place it where
 * it now belongs, then put it straight back with a transform and release it.
 *
 * This is the only motion left in the list, and it is transform-only — it can
 * move a row but never change what the layout is, so it cannot make the page
 * bob. Rows used to be excluded from it while they played a height animation
 * of their own; nothing animates its height any more, so nothing is excluded.
 */
function useFlipRows(containerRef: RefObject<HTMLElement | null>, signature: string) {
  const prevRects = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // This animation is driven from JS, so it has to honour the preference the
    // stylesheet's `prefers-reduced-motion` block cannot reach.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      prevRects.current = new Map();
      return;
    }

    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-flip-id]"));
    const nextTops = new Map<string, number>();
    const moved: { node: HTMLElement; dy: number }[] = [];

    for (const node of nodes) {
      const id = node.dataset.flipId;
      if (!id) continue;
      const top = node.getBoundingClientRect().top;
      nextTops.set(id, top);
      const before = prevRects.current.get(id);
      // One pixel of drift is sub-pixel layout noise, not a move worth playing.
      if (before !== undefined && Math.abs(before - top) > 1) {
        moved.push({ node, dy: before - top });
      }
    }
    prevRects.current = nextTops;
    if (moved.length === 0) return;

    for (const { node, dy } of moved) {
      node.style.transition = "none";
      node.style.transform = `translateY(${dy}px)`;
    }
    const frame = requestAnimationFrame(() => {
      for (const { node } of moved) {
        node.style.transition = "transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)";
        node.style.transform = "";
      }
    });
    // Styles are cleared once the play is over so nothing inherits a stale
    // transition into an unrelated interaction (hover, a later re-order).
    const cleanup = setTimeout(() => {
      for (const { node } of moved) {
        node.style.transition = "";
        node.style.transform = "";
      }
    }, 400);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(cleanup);
    };
  }, [signature, containerRef]);
}

export function TaskList() {
  const { tasks: allTasks, loading, error, refresh } = useTaskList();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<TaskFilters>(defaultFilters);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  // The control tower's 확인 필요 alarm links here with `?filter=attention`, so
  // the alarm is something you can act on rather than only read.
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter");
  useEffect(() => {
    if (filterParam === "attention" || filterParam === "active" || filterParam === "done") {
      setFilters((prev) => ({ ...prev, status: filterParam as MainFilter }));
    }
  }, [filterParam]);

  // The date range narrows the pool before anything else, so the status counts
  // and the rows always describe the same period.
  const tasks = useMemo(
    () => allTasks.filter((t) => isWithinRange(t, filters.range)),
    [allTasks, filters.range],
  );

  const [cancelTarget, setCancelTarget] = useState<TaskListItem | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TaskListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [startingIds, setStartingIds] = useState<Set<string>>(new Set());

  const projectOptions = useMemo(
    () => Array.from(new Set(tasks.map((t) => projectName(t.projectPath)))).sort(),
    [tasks],
  );

  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Which section a Task is drawn in — exactly one, always.
   *
   * A Task used to be drawn in two at once for 380ms, so that a card closing
   * above and a row growing below could overlap into a single continuous
   * shift. That timeline is gone: it depended on wall-clock phases racing the
   * poller, and when a status changed again mid-flight, or two Tasks finished
   * together, the list moved down and back up instead. A Task now simply
   * appears where it belongs on the render that carries its new status, and
   * `useFlipRows` eases everything around it into place.
   */
  const groupsOf = useMemo(() => (t: TaskListItem) => [statusGroupOf(t.status)], []);

  /** The group a Task belongs to, for the filter chips and their counts. */
  const groupKeyOf = useMemo(() => (t: TaskListItem) => statusGroupOf(t.status), []);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filters.status !== "all" && groupKeyOf(t) !== filters.status) return false;
      if (filters.project && projectName(t.projectPath) !== filters.project) return false;
      if (!q) return true;
      return (
        t.jobId.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        projectName(t.projectPath).toLowerCase().includes(q) ||
        (t.branch ?? "").toLowerCase().includes(q)
      );
    });
  }, [tasks, filters.status, filters.project, filters.search, groupKeyOf]);

  const counts: Record<MainFilter, number> = useMemo(() => {
    const c: Record<MainFilter, number> = { active: 0, attention: 0, done: 0, all: tasks.length };
    for (const t of tasks) c[groupKeyOf(t)] += 1;
    return c;
  }, [tasks, groupKeyOf]);

  /**
   * Rows always render in priority order (진행 중 → 확인 필요 → 완료). The
   * group headings on top of that only earn their space when they actually
   * separate something: with a single group present — the common case while
   * this workspace holds a handful of Tasks — a heading would just be a
   * label repeating what the status column already says, plus a band of
   * empty space above a one-row list.
   */
  const sections = useMemo(() => {
    const order: ("active" | "attention" | "done")[] = ["active", "attention", "done"];
    return order
      .map((key) => ({ key, items: filtered.filter((t) => groupsOf(t).includes(key)) }))
      .filter((s) => s.items.length > 0);
  }, [filtered, groupsOf]);

  /**
   * Derived from the *stable* grouping, not from `sections`.
   *
   * `sections` gains a second entry for the 380ms a Task is in both places,
   * which made both headings appear and then disappear again inside the
   * transition — about 28px each, roughly the same 56px the handoff was
   * already moving, and outside any animation that could absorb it. FLIP
   * cannot help: a heading that did not exist a frame ago has no previous
   * position to travel from.
   */
  const showSectionLabels = useMemo(
    () => new Set(filtered.map((t) => groupKeyOf(t))).size > 1,
    [filtered, groupKeyOf],
  );

  /**
   * What the FLIP pass keys off. Section membership and order is what actually
   * moves rows, so the signature is the rendered shape of the list — not the
   * Task data, which changes on every poll and would replay the animation
   * every two seconds for nothing.
   */
  const layoutSignature = useMemo(
    () =>
      `${showSectionLabels}|${sections.map((sec) => `${sec.key}:${sec.items.map((t) => t.id).join(",")}`).join("|")}`,
    [sections, showSectionLabels],
  );
  useFlipRows(listRef, layoutSignature);

  async function onStartClick(task: TaskListItem) {
    setStartingIds((prev) => new Set(prev).add(task.id));
    try {
      await tasksApi.start(task.id);
      void refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setStartingIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      await tasksApi.cancel(cancelTarget.id);
      showToast("success", `${cancelTarget.jobId} 작업을 중단했습니다.`);
      setCancelTarget(null);
      void refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setCancelBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await tasksApi.remove(deleteTarget.id);
      showToast("success", `${deleteTarget.jobId} 작업을 삭제했습니다.`);
      setDeleteTarget(null);
      void refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  const cancelIsQueued = cancelTarget?.status === "QUEUED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-fg">작업</h1>
      </div>

      {/*
        Kept mounted whenever the workspace holds any Task at all (not just any
        Task in range), so narrowing to a quiet period doesn't make the controls
        vanish along with the rows — leaving no way back.
      */}
      {allTasks.length > 0 ? (
        <TaskFilterBar
          filters={filters}
          onChange={setFilters}
          counts={counts}
          projectOptions={projectOptions}
        />
      ) : loading ? (
        // Not "no Tasks, so no controls" yet — just "not known". Holding the
        // bar's height here is what stops the list below from being shoved
        // down the moment the first poll answers.
        <TaskFilterBarSkeleton />
      ) : null}

      {/*
        One bordered surface for the whole list — header row, group
        headings and rows all live inside it. That container is what keeps
        a single-Task workspace from reading as a half-finished screen: the
        list has a defined shape whether it holds one row or forty.
      */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {loading && tasks.length === 0 ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState
            message={`목록을 불러오지 못했습니다: ${error}`}
            onRetry={refresh}
            className="m-4"
          />
        ) : tasks.length === 0 ? (
          allTasks.length > 0 ? (
            // Tasks exist, just not in this period — say so, rather than
            // claiming the workspace is empty and offering to create its first
            // Task when there are already forty.
            <EmptyState
              title={`${describeRange(filters.range)}에 작업이 없습니다`}
              description="기간을 넓히면 그 이전에 생성된 작업을 볼 수 있습니다."
            />
          ) : (
            <EmptyState
              title="아직 등록된 작업이 없습니다"
              description="프로젝트와 지시 내용을 입력하면 Claude 또는 Codex가 실행합니다."
              action={
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewTaskOpen(true)}>
                  새 작업
                </Button>
              }
            />
          )
        ) : filtered.length === 0 ? (
          <EmptyState
            title="조건에 맞는 작업이 없습니다"
            description="검색어나 필터를 조정해 보세요."
          />
        ) : (
          <>
            <TaskListHeader />
            <div ref={listRef} className="divide-y divide-border">
              {sections.map((section) => (
                <div key={section.key} className="divide-y divide-border">
                  {showSectionLabels ? (
                    <div
                      data-flip-id={`heading:${section.key}`}
                      className="flex items-center gap-2 bg-fg/[0.02] px-4 py-1.5 text-xs font-medium text-fg-muted"
                    >
                      {SECTION_LABEL[section.key]}
                      <span className="mono text-fg-faint">{section.items.length}</span>
                      {section.key === "attention" ? (
                        <span className="font-normal text-fg-faint">
                          {attentionBreakdownText(section.items)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {section.items.map((t) =>
                    section.key === "active" ? (
                      <ActiveTaskCard
                        key={t.id}
                        task={t}
                        onCancelClick={setCancelTarget}
                        onStartClick={onStartClick}
                        starting={startingIds.has(t.id)}
                      />
                    ) : (
                      <TaskRow key={t.id} task={t} onDeleteClick={setDeleteTarget} />
                    ),
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        title={cancelIsQueued ? "대기 작업 취소" : "실행 중단"}
        message={
          cancelTarget
            ? cancelIsQueued
              ? `${cancelTarget.jobId} "${cancelTarget.title}"을(를) 대기열에서 제거합니다. 아직 실행되지 않았습니다.`
              : `${cancelTarget.jobId} "${cancelTarget.title}"의 실행을 중단합니다. 진행 중인 프로세스가 종료됩니다.`
            : ""
        }
        confirmLabel={cancelIsQueued ? "대기 취소" : "실행 중단"}
        busy={cancelBusy}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="작업 삭제"
        message={
          deleteTarget
            ? `${deleteTarget.jobId} "${deleteTarget.title}"을(를) 삭제합니다. 되돌릴 수 없습니다. Markdown 기록은 남습니다.`
            : ""
        }
        confirmLabel="삭제"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <NewTaskModal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />
    </div>
  );
}
