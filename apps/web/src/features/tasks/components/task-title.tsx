"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { tasksApi } from "../api/tasks-api";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/format";

/**
 * The Task's heading, editable in place.
 *
 * Titles are produced by a heuristic from the instruction, so some of them are
 * wrong — and until this existed, wrong was permanent: no title field on the
 * create form, no rename anywhere. Correcting one is the common case *after*
 * the work is done ("what was T-18 again?"), which is why editing stays
 * available in terminal statuses too.
 *
 * The control is the heading itself rather than a separate edit button parked
 * beside it: the pencil only appears on hover/focus, so the default reading
 * state stays a plain title.
 */
export function TaskTitle({
  taskId,
  title,
  onRenamed,
}: {
  taskId: string;
  title: string;
  /** Called with the server's stored title — it may differ from what was typed (an empty submit regenerates it). */
  onRenamed?: (title: string) => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A rename elsewhere (or a poll) should win while not editing; mid-edit the
  // draft is the user's and must not be yanked out from under them.
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    if (!next || next === title) {
      setEditing(false);
      setDraft(title);
      return;
    }
    setSaving(true);
    try {
      const updated = await tasksApi.rename(taskId, next);
      onRenamed?.(updated.title);
      setEditing(false);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        disabled={saving}
        maxLength={200}
        aria-label="제목"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(title);
            setEditing(false);
          }
        }}
        className={cn(
          "w-full rounded-md border border-brand/60 bg-fg/[0.03] px-2 py-1",
          "text-2xl font-semibold leading-snug text-fg",
          "focus:outline-none focus:ring-2 focus:ring-focus/40 disabled:opacity-60",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="제목 수정"
      className={cn(
        "group flex w-full items-start gap-2 rounded-md px-2 py-1 text-left",
        "-mx-2 transition-colors duration-fast hover:bg-fg/[0.05]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
      )}
    >
      <h1 className="min-w-0 break-words text-2xl font-semibold leading-snug text-fg">{title}</h1>
      <Pencil
        className="mt-1.5 h-4 w-4 shrink-0 text-fg-faint opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />
    </button>
  );
}
