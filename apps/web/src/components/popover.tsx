"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";

interface AnchorRect {
  top: number;
  left: number;
  right: number;
  width: number;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Generic anchored panel: a trigger button that toggles a floating panel
 * positioned against it — the shared plumbing behind every custom dropdown
 * in the app (project picker, filter menus) so each one only has to
 * describe its own list content, not re-implement positioning, outside
 * click, Escape, or focus handling.
 *
 * The panel is portaled to `document.body` and positioned with `fixed` +
 * coordinates read from the trigger's `getBoundingClientRect()`, rather than
 * living in the DOM as an absolutely-positioned child of the trigger. That
 * matters most when a Popover opens inside a Dialog: the Dialog's own
 * scrollable content area (`overflow-y-auto`) would otherwise clip an
 * in-tree absolute child the moment it overflows that box, no matter its
 * z-index. Portaling sidesteps the clipping entirely. Position is
 * recomputed on scroll (capture-phase, so it also catches scrolling inside
 * the Dialog's own scroll container, which doesn't bubble to window) and
 * resize, so the panel tracks its trigger instead of drifting.
 *
 * Because the panel is a DOM sibling of the trigger (not a following
 * sibling in tab order), keyboard users would otherwise have to Tab through
 * the entire rest of the page to reach it. So opening moves focus *into*
 * the panel — at whatever carries `data-popover-autofocus`, else the first
 * focusable child — and closing hands focus back to the trigger. Panels
 * that own their own key handling (see SelectMenu's listbox) simply mark
 * the element that should receive focus.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  panelClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (opts: {
    open: boolean;
    toggle: () => void;
    setOpen: (v: boolean) => void;
  }) => ReactNode;
  children: (opts: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [rect, setRect] = useState<AnchorRect | null>(null);

  const setOpen = (v: boolean) => {
    if (v) {
      // Remember whatever had focus right before opening (normally the
      // trigger itself) so closing can hand focus back to it.
      previouslyFocused.current = document.activeElement as HTMLElement | null;
    } else if (panelRef.current?.contains(document.activeElement)) {
      // Only steal focus back if it's still inside the panel that's about
      // to disappear — a click that already moved focus elsewhere (e.g.
      // picking an option that itself navigates) is left alone.
      previouslyFocused.current?.focus?.();
    }
    setUncontrolledOpen(v);
    onOpenChange?.(v);
  };

  const reposition = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.left, right: r.right, width: r.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Move focus into the panel once it exists (i.e. after `rect` is known and
  // the portal has rendered), so the keyboard path into the menu is one key
  // press, not a full trip around the page's tab order.
  useEffect(() => {
    if (!open || !rect) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target =
      panel.querySelector<HTMLElement>("[data-popover-autofocus]") ??
      panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    target?.focus();
  }, [open, rect]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Stop here so a Dialog this Popover happens to be nested in doesn't
      // also see the same Escape and close itself — one press should only
      // ever dismiss the topmost open layer.
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    // `true` (capture) here and on the matching removeEventListener below —
    // an add/remove pair only unregisters the same listener when every
    // option (including `capture`) matches exactly, otherwise this leaks a
    // new document-level keydown listener every time a Popover opens.
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={anchorRef} className="relative">
      {trigger({ open, toggle: () => setOpen(!open), setOpen })}
      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              data-popover-panel
              style={{
                position: "fixed",
                top: rect.top,
                left: align === "end" ? undefined : rect.left,
                right: align === "end" ? window.innerWidth - rect.right : undefined,
                minWidth: rect.width,
              }}
              className={cn(
                "animate-fade-in-up z-[110] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg",
                panelClassName,
              )}
            >
              {children({ close: () => setOpen(false) })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
