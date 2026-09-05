import { Suspense } from "react";
import { TaskList, TaskListFallback } from "@/features/tasks/components/task-list";
import { UsageBand } from "@/features/usage/components/usage-band";

/**
 * The dashboard is the usage band and the Task list.
 *
 * What used to sit above the list — an AI team band and a 오늘 요약 card — each
 * reserved space to report that nothing had happened, so the page was at its
 * emptiest-looking exactly when there was least to say. Both are now the
 * control tower in the app header: always visible, one line while idle,
 * expanding only when there is work to show.
 *
 * `UsageBand` is back in that space, and the distinction is the one that got
 * the others removed: a plan limit and a day's token count always have a value.
 * They do not go blank on a quiet morning — 0% used is a real reading, and the
 * one worth having precisely when nothing is running. Anything added here later
 * has to clear that same bar or it belongs in the control tower instead.
 *
 * The Suspense boundary is required, not decorative: `TaskList` reads
 * `useSearchParams()` (the tower's 확인 필요 alarm links here with
 * `?filter=attention`), and Next refuses to prerender a page that calls it
 * outside one. Without this the dev server is happy and `next build` fails.
 */
export default function DashboardPage() {
  return (
    <>
      {/* Outside the Suspense boundary on purpose: the band does not read
          search params, so it must not be held back by the list's fallback. */}
      <UsageBand />
      <Suspense fallback={<TaskListFallback />}>
        <TaskList />
      </Suspense>
    </>
  );
}
