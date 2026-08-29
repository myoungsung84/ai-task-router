import { DiscussionList } from "@/features/discussions/components/discussion-list";

/**
 * The 논의 tab's index. A sibling route to the dashboard rather than a view
 * inside it, because §10 of the proposal makes discussions a separate domain
 * from Tasks — and because the separation is what guarantees the rest of that
 * rule: no screen under /discussions has any control that writes a file, runs
 * a test or touches a branch.
 */
export default function DiscussionsPage() {
  return <DiscussionList />;
}
