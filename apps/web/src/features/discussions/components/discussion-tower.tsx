"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { AGENT_LABEL } from "@/features/tasks/workflow-labels";
import { cn } from "@/lib/format";
import { MOCK_DISCUSSIONS } from "../mock";
import { COMPOSE_STAGE_LABEL } from "../types";

/**
 * The control tower for the 논의 tab.
 *
 * Same contract as the Task tower, deliberately: it rides in the header rather
 * than sitting on the page, it is exactly one line, and it carries only what
 * the list underneath cannot say about itself — whether anyone is mid-turn,
 * how many questions are still open across every room, and which rooms have
 * stalled into 조율 중 and are waiting on the user.
 *
 * The contract is what makes the two towers one instrument rather than two
 * widgets that happen to share a strip. Only the contents change with the tab.
 *
 * 조율 필요 is the alarm here, filling the same slot 확인 필요 fills on the
 * Task side: the state that stops on its own and stays stopped until a person
 * intervenes. Everything else in a discussion eventually moves by itself.
 */
export function DiscussionTower() {
  const discussions = MOCK_DISCUSSIONS;

  const composing = discussions
    .map((d) => (d.composing ? { room: d, composing: d.composing } : null))
    .filter((v): v is NonNullable<typeof v> => v !== null);
  const mediating = discussions.filter((d) => d.status === "mediating");
  const open = discussions
    .filter((d) => d.status !== "closed")
    .reduce((n, d) => n + d.summary.open.length, 0);

  const live = composing.length > 0;
  const first = composing[0];

  return (
    <div
      className={cn(
        "border-b transition-colors duration-base",
        live ? "border-brand/25 bg-brand/[0.04]" : "border-border bg-fg/[0.015]",
      )}
    >
      <div className="mx-auto w-full max-w-content px-4 sm:px-6">
        <div className="flex h-10 items-center gap-3 text-xs">
          <span className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 rounded-full",
                live ? "bg-brand" : "agent-breathe bg-fg-faint",
              )}
            />
            <span className={cn("font-medium", live ? "text-fg" : "text-fg-muted")}>
              {first
                ? `${AGENT_LABEL[first.composing.agent]} ${COMPOSE_STAGE_LABEL[first.composing.stage]}`
                : "대기 중"}
            </span>
          </span>

          {/* Which room the named AI is writing in — a character that looks
              busy without saying what it is busy with is decoration. */}
          {first ? (
            <span className="hidden min-w-0 flex-1 truncate text-fg-faint sm:inline">
              {first.room.title}
            </span>
          ) : null}

          <span className="hidden shrink-0 text-fg-faint md:inline">
            미결정 쟁점 <span className="mono text-fg-muted">{open}</span>
          </span>

          <span className="ml-auto flex shrink-0 items-center gap-3">
            {mediating.length > 0 ? (
              <Link
                href="/discussions"
                className="flex items-center gap-1.5 rounded-full bg-warning/12 px-2.5 py-1 font-medium text-warning transition-colors duration-fast hover:bg-warning/20"
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
