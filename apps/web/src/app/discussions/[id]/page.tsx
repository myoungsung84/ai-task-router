"use client";

import { DiscussionRoom } from "@/features/discussions/components/discussion-room";

/**
 * One discussion room. Client-rendered because the document is live — rounds
 * open and close while the page is open, and the participants writing into it
 * are agents in their own sessions rather than anything this page controls.
 */
export default function DiscussionRoomPage({ params }: { params: { id: string } }) {
  return <DiscussionRoom id={params.id} />;
}
