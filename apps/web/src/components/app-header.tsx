"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/format";

/**
 * Single 새 작업 entry point, available from every route, plus the app's two
 * global controls (theme, settings). A hairline bottom border rather than a
 * shadow or a raised bar — the header's job is to hold the page's left edge
 * and its primary action, not to announce itself.
 *
 * The right-hand cluster runs quiet → loud: two 36px icon buttons (theme,
 * settings) then the one filled action. All three share the same height, so
 * the cluster reads as a single row rather than three separate widgets.
 */
export function AppHeader() {
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/settings");

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <BrandMark size={20} />
          AI Task Router
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/settings"
            aria-label="설정"
            title="설정"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              onSettings
                ? "bg-fg/[0.08] text-fg"
                : "text-fg-muted hover:bg-fg/[0.06] hover:text-fg",
            )}
          >
            <Settings2 className="h-4 w-4" aria-hidden />
          </Link>
          <Button
            className="ml-1"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setNewTaskOpen(true)}
          >
            새 작업
          </Button>
        </div>
      </div>
      <NewTaskModal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />
    </header>
  );
}
