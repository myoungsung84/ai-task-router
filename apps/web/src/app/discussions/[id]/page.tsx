import { notFound } from "next/navigation";
import { DiscussionRoom } from "@/features/discussions/components/discussion-room";
import { findDiscussion, MOCK_DISCUSSIONS } from "@/features/discussions/mock";

/**
 * One discussion room. Reads from the mock store for now — see
 * docs/discussion-room-ux.md §6 for the append-only document this will read
 * once the store exists.
 */
export function generateStaticParams() {
  return MOCK_DISCUSSIONS.map((d) => ({ id: d.id }));
}

export default function DiscussionRoomPage({ params }: { params: { id: string } }) {
  const discussion = findDiscussion(params.id);
  if (!discussion) notFound();
  return <DiscussionRoom discussion={discussion} />;
}
