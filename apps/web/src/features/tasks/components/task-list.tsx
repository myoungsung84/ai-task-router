"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTaskList } from "../hooks/use-task-list";
import { tasksApi } from "../api/tasks-api";
import type { MainFilter } from "./status-filter";
import { TaskFilterBar, defaultFilters, type TaskFilters } from "./task-filter-bar";
import { TaskListHeader, TaskRow } from "./task-row";
import { ActiveTaskCard } from "./active-task-card";
import { NewTaskModal } from "./new-task-modal";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useToast } from "@/components/toast";
import { projectName } from "@/lib/format";
import { describeRange, isWithinRange } from "../date-range";
import { statusGroupOf } from "../types";
import { FADE_MS, SIZE_MS, beginCardClose, prefersReduced } from "../hooks/use-row-transition";
import {
  ATTENTION_REASON_LABEL,
  attentionReasonOf,
  type AttentionReason,
} from "../workflow-labels";
import type { TaskListItem } from "../types";

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

/*
 * The move from 진행 중 down to 완료, as one timeline measured from the moment
 * the Task stops running.
 *
 *   0ms    the card's contents fade
 *   240ms  the card's height closes  ── and, at the same instant, the 완료 row
 *          begins growing into place, frame first
 *   620ms  the card is gone; the row is at full height
 *   860ms  the row's contents have resolved inside it
 *
 * The overlap in the middle is the point. Run in sequence — card fully closed,
 * *then* row opened — everything below travelled 108px up and 52px back down,
 * two opposing moves for one event, which is what read as "not smooth" no
 * matter how the easing was tuned. Overlapped, the closing gap and the opening
 * one cancel to a single continuous shift.
 *
 * The cost is that the Task is briefly in both sections at once. That is safe
 * only because the overlap starts at 240ms — after the card's contents have
 * faded to nothing — so what is duplicated is an invisible collapsing box, not
 * a second copy of the row.
 */
const CARD_FADE_MS = FADE_MS;
const SETTLE_MS = FADE_MS + SIZE_MS;
const TOTAL_MS = FADE_MS + SIZE_MS + FADE_MS;

/**
 * A little slack past the arithmetic end, so a frame of scheduling jitter can
 * never unmount an element while its own transition is still running — the
 * failure that made a card look like it vanished rather than closed.
 */
const TAIL_MS = 90;

interface TaskTransitions {
  /** Held in 진행 중, playing the card's exit. */
  settling: Set<string>;
  /** Growing into 완료. Overlaps `settling` for the middle of the handoff. */
  entering: Set<string>;
}

/**
 * Both halves of that timeline, derived from one start time per Task.
 *
 * **Detection happens during render, not in an effect, and that is the whole
 * point of this shape.** A passive `useEffect` runs after the browser is free
 * to paint, so on the render that first carried the finished Task the list had
 * no transition recorded yet, put the Task straight into 완료, and painted the
 * finished row at its natural height — the flash that was read as "it pops".
 * Only afterwards did the effect notice, and a later tick moved it back to a
 * card so the animation could start from a state the user had already seen.
 *
 * Writing to the ref here is guarded by the identity of `activeIds` and by
 * `startedRef` itself, so it is idempotent: a repeated render (StrictMode, a
 * bail-out) cannot start a second timeline for the same Task.
 *
 * Re-renders are scheduled at the phase boundaries themselves rather than by
 * polling. An earlier version ticked every 60ms, which quantised every phase
 * start by up to a frame's worth of time while the end was still measured from
 * the original timestamp — so the two clocks disagreed and elements were
 * dropped early.
 */
function useTaskTransitions(tasks: TaskListItem[]): TaskTransitions {
  const prevActiveRef = useRef<Set<string> | null>(null);
  const startedRef = useRef<Map<string, number>>(new Map());
  const [, bump] = useState(0);

  const activeIds = useMemo(
    () => new Set(tasks.filter((t) => statusGroupOf(t.status) === "active").map((t) => t.id)),
    [tasks],
  );

  if (prevActiveRef.current !== activeIds) {
    const previous = prevActiveRef.current;
    prevActiveRef.current = activeIds;
    if (previous) {
      const startedAt = Date.now();
      // With motion reduced the hooks below animate nothing, so running the
      // timeline anyway just held the Task in 진행 중 for 950ms and then
      // dropped it — slower than no animation and just as abrupt.
      for (const id of prefersReduced() ? [] : previous) {
        // Still present in the list, no longer active, not already moving —
        // a Task that was *deleted* simply goes, with nothing to animate.
        if (!activeIds.has(id) && !startedRef.current.has(id) && tasks.some((t) => t.id === id)) {
          startedRef.current.set(id, startedAt);
        }
      }
    }
  }

  const now = Date.now();
  const settling = new Set<string>();
  const entering = new Set<string>();
  let nextBoundary = Infinity;

  for (const [id, startedAt] of startedRef.current) {
    const elapsed = now - startedAt;
    if (elapsed < SETTLE_MS) settling.add(id);
    if (elapsed >= CARD_FADE_MS) entering.add(id);
    // The next moment this Task changes what it renders.
    for (const boundary of [CARD_FADE_MS, SETTLE_MS, TOTAL_MS + TAIL_MS]) {
      if (elapsed < boundary) {
        nextBoundary = Math.min(nextBoundary, startedAt + boundary);
        break;
      }
    }
  }

  useEffect(() => {
    if (!Number.isFinite(nextBoundary)) return;
    const wait = Math.max(0, nextBoundary - Date.now());
    const timer = setTimeout(() => {
      const at = Date.now();
      for (const [id, startedAt] of startedRef.current) {
        if (at - startedAt >= TOTAL_MS + TAIL_MS) startedRef.current.delete(id);
      }
      bump((v) => v + 1);
    }, wait);
    return () => clearTimeout(timer);
  }, [nextBoundary]);

  return { settling, entering };
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
 * Rows playing their own height animation are excluded (`data-flip-id` is
 * withheld while entering) — transforming an element that is mid-collapse
 * fights its own keyframes.
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

  const { settling: settlingIds, entering: enteringIds } = useTaskTransitions(tasks);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * The compensation, done in the commit that inserts the arriving row and
   * before the browser paints it.
   *
   * The previous version measured "some row already on screen" into a ref and
   * let the leaving card shrink itself on its own `setTimeout`. Both halves
   * were wrong. The selector took the first Task row in DOM order, and since
   * a running card carries no `data-flip-id` that was a 확인 필요 row whenever
   * one existed — about 72px against the 완료 row's 52 — so the card handed
   * back twenty pixels that were never taken. And the card's timer and the
   * render that inserted the row were two independent clocks, so whichever
   * landed first got a frame of the list at the wrong height.
   *
   * Here the row is measured *after* it exists and the card is shrunk before
   * anything is drawn, so the insertion genuinely costs the list nothing.
   */
  const compensatedRef = useRef<Set<string>>(new Set());
  const enteringKey = Array.from(enteringIds).sort().join(",");
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root || prefersReduced()) return;

    for (const id of enteringKey ? enteringKey.split(",") : []) {
      if (compensatedRef.current.has(id)) continue;
      compensatedRef.current.add(id);

      const row = root.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
      const card = root.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
      // No card to take the space from — the destination section is filtered
      // out of view, or the Task went straight there. Nothing to compensate.
      if (!row || !card) continue;

      beginCardClose(card, row.getBoundingClientRect().height);
    }

    for (const id of compensatedRef.current) {
      if (!enteringIds.has(id)) compensatedRef.current.delete(id);
    }
  }, [enteringKey, enteringIds]);

  /**
   * Which sections a Task is drawn in.
   *
   * Normally one, and the mid-handoff overlap is the single exception: a Task
   * whose card is still closing above while its row is already growing below
   * is genuinely in two places, and saying so here is what lets the two
   * motions run at once (see `useTaskTransitions`).
   */
  const groupsOf = useMemo(
    () => (t: TaskListItem) => {
      const real = statusGroupOf(t.status);
      const groups: MainFilter[] = [];
      if (real === "active" || settlingIds.has(t.id)) groups.push("active");
      // Its destination, once it has started arriving there — or immediately,
      // for anything not in the middle of a handoff at all.
      if (real !== "active" && (enteringIds.has(t.id) || !settlingIds.has(t.id))) {
        groups.push(real);
      }
      return groups;
    },
    [settlingIds, enteringIds],
  );

  /**
   * The single group a Task *belongs* to, for the filter chips and their
   * counts. Deliberately not `groupsOf`: a Task counted in two places for
   * 380ms would make the totals above the list twitch every time one finished.
   */
  const groupKeyOf = useMemo(
    () => (t: TaskListItem) => (settlingIds.has(t.id) ? "active" : statusGroupOf(t.status)),
    [settlingIds],
  );

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
      ) : null}

      {/*
        One bordered surface for the whole list — header row, group
        headings and rows all live inside it. That container is what keeps
        a single-Task workspace from reading as a half-finished screen: the
        list has a defined shape whether it holds one row or forty.
      */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {loading && tasks.length === 0 ? (
          <LoadingState label="작업 목록을 불러오는 중" padding="md" className="justify-center" />
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
                        leaving={settlingIds.has(t.id)}
                      />
                    ) : (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onDeleteClick={setDeleteTarget}
                        entering={enteringIds.has(t.id)}
                      />
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
