"use client";

import { useState } from "react";
import Link from "next/link";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";

/**
 * Single New Task entry point, available from every route via the layout.
 * Opens the same creation modal the dashboard used to embed inline —
 * that inline copy was removed so there is exactly one place to start a
 * Task (see features/tasks/components/task-list.tsx).
 */
export function AppHeader() {
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  return (
    <header className="border-b border-[#232c38] bg-[#0e131a]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight text-white">
          AI Task Router
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-[#8291a3]">
          <Link href="/" className="hover:text-white">
            Tasks
          </Link>
          <Link href="/settings" className="hover:text-white">
            Settings
          </Link>
          <button
            onClick={() => setNewTaskOpen(true)}
            className="rounded-md bg-white/10 px-3 py-1.5 text-white hover:bg-white/20"
          >
            + New Task
          </button>
        </nav>
      </div>
      <NewTaskModal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />
    </header>
  );
}
