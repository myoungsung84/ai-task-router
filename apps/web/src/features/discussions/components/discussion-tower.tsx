"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/format";
import { useDiscussions } from "../hooks/use-discussions";

/**
 * The control tower for the 논의 tab.
 *
 * Same contract as the Task tower, deliberately: it rides in the header rather
 * than sitting on the page, it is exactly one line, and it carries only what
 * the list underneath cannot say about itself — how many questions are open
 * across every room, and which rooms have stalled into 조율 중 and are waiting
 * on the user.
 *
 * The contract is what makes the two towers one instrument rather than two
 * widgets that happen to share a strip. Only the contents change with the tab.
 *
 * 조율 필요 is the alarm here, filling the slot 확인 필요 fills on the Task
 * side: the state that stops on its own and stays stopped until a person
 * intervenes. Everything else in a discussion eventually moves by itself.
 */
export function DiscussionTower() {
  const { discussions, loading } = useDiscussions();

  // Nothing is known yet — an empty strip beats one asserting "대기 중" about
  // rooms it has not loaded.
  if (loading && discussions.length === 0) return null;

  const live = discussions.filter((d) => d.status === "active");
  const mediating = discussions.filter((d) => d.status === "mediating");
  const open = discussions
    .filter((d) => d.status !== "closed")
    .reduce((n, d) => n + d.summary.open.length, 0);

  return (
    <div className="border-b border-border bg-fg/[0.015]">
      <div className="mx-auto w-full max-w-content px-4 sm:px-6">
        <div className="flex h-10 items-center gap-3 text-xs">
          <span className="flex shrink-0 items-center gap-2">
            <span aria-hidden className="agent-breathe h-2 w-2 rounded-full bg-fg-faint" />
            <span className="font-medium text-fg-muted">
              {live.length > 0 ? `진행 중 ${live.length}건` : "진행 중인 논의 없음"}
            </span>
          </span>

          <span className="hidden shrink-0 text-fg-faint md:inline">
            미결정 쟁점 <span className="mono text-fg-muted">{open}</span>
          </span>

          <span className="ml-auto flex shrink-0 items-center gap-3">
            {mediating.length > 0 ? (
              <Link
                href="/discussions"
                className={cn(
                  "flex items-center gap-1.5 rounded-full bg-warning/12 px-2.5 py-1 font-medium text-warning",
                  "transition-colors duration-fast hover:bg-warning/20",
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                조율 필요 {mediating.length}
              </Link>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
