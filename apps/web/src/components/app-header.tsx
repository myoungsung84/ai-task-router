"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";
import { ControlTower } from "@/features/agents/components/control-tower";
import { DiscussionTower } from "@/features/discussions/components/discussion-tower";
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
 *
 * 작업 and 논의 are tabs here rather than sections of one page because the
 * proposal makes them separate domains (docs/discussion-room-proposal.md §10),
 * and the split is load-bearing: that section also forbids writing files,
 * running tests or touching branches during a discussion, and a discussion
 * route that shares no controls with the Task side cannot offer any of it.
 *
 * The tower below switches with the tab. Its contract does not — resident, one
 * line, carrying only what the list beneath cannot say about itself — which is
 * what keeps the two variants one instrument instead of two strips that happen
 * to sit in the same place.
 */

const TABS = [
  { href: "/", label: "작업" },
  { href: "/discussions", label: "논의" },
];

export function AppHeader() {
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/settings");
  const onDiscussions = pathname.startsWith("/discussions");

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <BrandMark size={20} />
            <span className="hidden sm:inline">AI Task Router</span>
          </Link>
          {/*
            Route tabs, so they are links and not buttons — each names a place,
            survives a reload, and can be opened in a new tab. The underline
            matches the in-page Tabs primitive so switching domains and
            switching views of one record read as the same gesture.
          */}
          <nav className="flex h-14 items-center gap-4">
            {TABS.map((tab) => {
              const active = tab.href === "/" ? !onDiscussions && !onSettings : onDiscussions;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full items-center border-b-2 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    active
                      ? "border-brand text-fg"
                      : "border-transparent text-fg-muted hover:text-fg",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
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
          {/*
            The primary action follows the tab: creating a discussion is not
            creating a Task, and offering 새 작업 from a discussion screen would
            invite exactly the crossover §10 rules out. Disabled on the 논의 tab
            until the document store exists, rather than hidden — the tab is
            supposed to look like it has a way in.
          */}
          {onDiscussions ? (
            <Button className="ml-1" icon={<Plus className="h-4 w-4" />} disabled>
              새 논의
            </Button>
          ) : (
            <Button
              className="ml-1"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setNewTaskOpen(true)}
            >
              새 작업
            </Button>
          )}
        </div>
      </div>
      {/*
        The control tower rides along with the header rather than living on the
        dashboard, so the workspace's condition is present on every screen and
        never scrolls out of reach. It renders a single line while idle, so a
        quiet workspace costs one row.
      */}
      {onDiscussions ? <DiscussionTower /> : <ControlTower />}
      <NewTaskModal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />
    </header>
  );
}
