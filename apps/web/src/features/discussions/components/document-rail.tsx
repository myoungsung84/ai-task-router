"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/format";
import type { DiscussionSummary } from "@ai-task-router/shared";
import { discussionsApi } from "../api/discussions-api";

/**
 * The source document, resident but collapsed.
 *
 * This is the room's hardest layout problem. The proposal (§2) makes the
 * document the single basis of every judgment while the chat is only a summary
 * for people — so hiding it behind a link removes the actual subject from the
 * screen, and splitting the room evenly with it produces a document editor
 * with a chat attached, which is the meeting-management UI §8 rules out.
 *
 * Same resolution as the control tower: present always, one line by default,
 * carrying only what the stream below cannot say about itself. `합의 3 · 쟁점
 * 2 · v15` already satisfies §8's ask for a running summary of agreements and
 * open points; the full text is one click away for when someone actually wants
 * to read it.
 *
 * What renders here is the latest 요약 block and nothing else. The document is
 * append-only, so earlier blocks are all still in the file — they are history,
 * not state, and showing them would make a growing file look like growing
 * disagreement.
 */

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((it) => (
          <li key={it} className="flex gap-1.5 text-xs text-fg-secondary">
            <span aria-hidden className="select-none text-fg-faint">
              ·
            </span>
            <span className="min-w-0">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocumentRail({
  discussionId,
  summary,
  version,
  className,
}: {
  discussionId: string;
  summary: DiscussionSummary;
  version: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <aside className={cn("rounded-lg border border-border bg-surface", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors duration-fast hover:bg-fg/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-fg-secondary">
          합의 {summary.agreed.length} · 쟁점 {summary.open.length}
          {summary.decisions.length > 0 ? ` · 결정 ${summary.decisions.length}` : ""}
        </span>
        <span className="mono shrink-0 text-fg-faint">v{version}</span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <Section title="사용자 결정" items={summary.decisions} />
          <Section title="합의된 내용" items={summary.agreed} />
          <Section title="미결정 쟁점" items={summary.open} />
          <Section title="확인된 사실" items={summary.facts} />
          {/*
            The append log itself. Reading the raw file is a real need when a
            summary looks wrong — but it is the exception, so it sits one level
            below the summary rather than beside it.
          */}
          <button
            type="button"
            onClick={async () => {
              if (log !== null) {
                setLog(null);
                return;
              }
              setLog(
                await discussionsApi.document(discussionId).catch(() => "불러오지 못했습니다."),
              );
            }}
            className="text-xs text-fg-faint underline-offset-2 transition-colors duration-fast hover:text-fg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {log === null ? "전체 기록 보기" : "전체 기록 접기"}
          </button>
          {log !== null ? (
            <pre className="mono max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-sunken p-2 text-[11px] leading-relaxed text-fg-muted">
              {log}
            </pre>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
