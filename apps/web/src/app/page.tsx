import { Suspense } from "react";
import { TaskList } from "@/features/tasks/components/task-list";
import { LoadingState } from "@/components/states";

/**
 * The dashboard is the Task list, and only the Task list.
 *
 * What used to sit above it — an AI team band and a 오늘 요약 card — each
 * reserved space to report that nothing had happened, so the page was at its
 * emptiest-looking exactly when there was least to say. Both are now the
 * control tower in the app header: always visible, one line while idle,
 * expanding only when there is work to show.
 *
 * The Suspense boundary is required, not decorative: `TaskList` reads
 * `useSearchParams()` (the tower's 확인 필요 alarm links here with
 * `?filter=attention`), and Next refuses to prerender a page that calls it
 * outside one. Without this the dev server is happy and `next build` fails.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingState label="작업 목록을 불러오는 중" padding="md" />}>
      <TaskList />
    </Suspense>
  );
}
