"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { Popover } from "./popover";

/**
 * A styled tip that opens the instant you point at it, and stays if you click.
 *
 * The browser's own `title` attribute is not a substitute and was tried first:
 * it renders in the OS's tooltip style (which has nothing to do with this
 * theme), waits about a second before appearing — long enough that nobody
 * discovers it — and wraps its text at whatever width it likes, which broke
 * multi-value lines mid-item. None of those are things a page can influence.
 *
 * Hover opens it; click pins it, so a tip with several lines can be read
 * without holding the pointer perfectly still. Keyboard focus opens it too,
 * which is the other reason the trigger is a real `button`.
 *
 * Positioning, portaling and outside-dismiss come from `Popover` — including
 * the part that matters here: a row with `overflow-hidden` would clip an
 * in-tree absolute panel, and Popover portals to the body instead. Its
 * focus-into-panel behaviour is inert for this use because a tip holds no
 * focusable content.
 */
export function HoverTip({
  tip,
  children,
  align = "start",
  className,
  label,
}: {
  tip: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  /** Classes for the trigger itself. */
  className?: string;
  /** Accessible name, since the trigger is usually a glyph. */
  label?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);

  return (
    <Popover
      align={align}
      open={hovered || pinned}
      onOpenChange={(next) => {
        if (next) return;
        // Dismissed from the outside (Escape, a click elsewhere): drop both
        // reasons it could be open, or a stale `hovered` keeps it up after
        // the pointer has already gone.
        setPinned(false);
        setHovered(false);
      }}
      panelClassName="max-w-xs"
      trigger={() => (
        <button
          type="button"
          aria-label={label}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          onClick={() => setPinned((was) => !was)}
          className={cn(
            "cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            className,
          )}
        >
          {children}
        </button>
      )}
    >
      {() => (
        <div className="whitespace-pre-line px-3 py-2 text-xs leading-relaxed text-fg-secondary">
          {tip}
        </div>
      )}
    </Popover>
  );
}
