"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/format";
import { IconButton } from "./button";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Rendered via `createPortal` straight onto `document.body` — never as a
 * descendant of the app header. The header is `sticky` with `backdrop-blur`
 * (a CSS `filter`), and a `filter`/`backdrop-filter` on an ancestor creates
 * a new containing block for `position: fixed` descendants per spec — so a
 * plain in-tree `fixed inset-0` dialog rendered inside the header was being
 * boxed into the header's own small stacking context instead of covering
 * the viewport. Portaling to `document.body` sidesteps that entirely: the
 * overlay/content are now direct children of `body`, so their `fixed`
 * positioning and z-index are never subject to any ancestor's stacking
 * context or containing block.
 *
 * Three fixed regions: header (title), a single scrolling body, and an
 * optional pinned `footer`. The footer lives *outside* the scroll area on
 * purpose — a form's primary action shouldn't drift out of view as the form
 * grows, and a bordered bar at a fixed position is what makes it read as
 * "the dialog's footer" rather than "the last row of the form".
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Body scroll lock — restores whatever inline overflow was there before
  // (almost always empty) rather than assuming "" is always safe to write.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Focus in on open (the close button — never an arbitrary field, so
  // opening never triggers e.g. a virtual keyboard on mobile), focus back
  // out to whatever triggered the dialog on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Escape to close, Tab/Shift+Tab trapped within the dialog's own
  // focusable elements so focus can never silently leave into the page
  // underneath while it's open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !contentRef.current) return;
      // A Popover opened from inside this Dialog (e.g. the project picker)
      // portals its panel straight to `document.body` — it's a DOM sibling
      // of the dialog, not a descendant of `contentRef` — so the trap has
      // to explicitly pull in any such panel too, or Tab/Shift+Tab would
      // walk past it into whatever the browser's native tab order finds
      // next (potentially the page behind the dialog).
      const scopes = [
        contentRef.current,
        ...Array.from(document.querySelectorAll<HTMLElement>("[data-popover-panel]")),
      ];
      const focusable = scopes
        .flatMap((scope) => Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)))
        .filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-bg/70 p-4 pt-[7vh] backdrop-blur-sm">
      <button
        aria-label="닫기"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-fade-in-up relative flex w-full flex-col rounded-xl border border-border bg-surface-raised shadow-lg",
          maxWidthClassName,
        )}
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">{title}</h2>
            {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
          </div>
          <IconButton
            ref={closeButtonRef}
            label="닫기"
            onClick={onClose}
            size="sm"
            className="-mr-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div
          className={cn(
            "min-h-0 overflow-y-auto px-6",
            footer ? "max-h-[70vh] pb-6" : "max-h-[76vh] pb-6",
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 rounded-b-xl border-t border-border bg-fg/[0.02] px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
