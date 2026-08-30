"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Collapsing and revealing a list row against its *measured* height.
 *
 * These were CSS keyframes first, animating `max-height` between 0 and a
 * guessed ceiling, and that guess is what made the motion feel abrupt. A card
 * is about 108px tall and the keyframe ran 220px → 0: the first half of the
 * collapse changed nothing visible, and the whole real distance was then
 * covered in what was left, accelerating into the end. The reveal had the
 * mirror of the fault — 0 → 140px on a 52px row, so it finished opening at
 * about a third of its own duration and then eased through empty space.
 *
 * The easing was never wrong; it was applied to a range the content did not
 * occupy. Measuring first is the only way to put the curve on the real
 * distance, and it cannot be expressed in a stylesheet.
 *
 * Both honour `prefers-reduced-motion` by leaving the element alone, which
 * lands it in its final state immediately.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

export function prefersReduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(REDUCED).matches;
}

/**
 * One curve for both height changes, and it has to be one.
 *
 * The card shrank on an ease-in while the row grew on an ease-out, on the
 * assumption that overlapping them was enough to cancel. It is not: early in
 * the overlap the row grew fast while the card was still barely moving, so the
 * combined height briefly *increased* and shoved the rows below downward, then
 * reversed and pulled them back up. The sum of two heights is only monotonic
 * if both run on the same progress.
 */
const EASE_SIZE = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Content fades over this before the height on either side of the handoff. */
export const FADE_MS = 240;
/** The height change itself, matched on both sides so they can run together. */
export const SIZE_MS = 380;

/**
 * A row's frame — its status rail — is marked with `data-row-frame` and is
 * deliberately *not* faded with the rest.
 *
 * That is the whole of the "placeholder first" idea: the arriving row is a
 * visible object from its first frame, growing into place, with its contents
 * resolving inside it. Opening an empty gap and filling it afterwards reads as
 * the list tearing apart and healing, not as a row being added.
 */
function contentsOf(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.dataset.rowFrame === undefined,
  );
}

/**
 * Closes a leaving card, giving back `liftPx` of its height in one invisible
 * step first.
 *
 * Exported and idempotent because the caller that knows the right `liftPx` is
 * the list, not the card: only the list is present in the commit that inserts
 * the arriving row, and only there can the row be measured and the card
 * shrunk before the browser paints either. `useCollapseOut` keeps a late
 * fallback for the cases where no row ever arrives to trigger it — a filter
 * that hides the destination section, a Task deleted mid-flight.
 */
export function beginCardClose(el: HTMLElement, liftPx: number) {
  if (el.dataset.closing) return;
  el.dataset.closing = "1";

  const remaining = Math.max(0, el.getBoundingClientRect().height - liftPx);
  el.style.transition = "none";
  el.style.height = `${remaining}px`;
  // Forces the browser to take the step above as a starting point rather than
  // folding it into the transition that follows.
  void el.offsetHeight;

  el.style.transition = `height ${SIZE_MS}ms ${EASE_SIZE}, padding ${SIZE_MS}ms ${EASE_SIZE}`;
  el.style.height = "0px";
  el.style.paddingTop = "0px";
  el.style.paddingBottom = "0px";
  el.style.borderTopColor = "transparent";
}

/** Fade the contents; the close itself is triggered by the list. Total ≈ 620ms. */
export function useCollapseOut(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active || prefersReduced()) return;

    el.style.overflow = "hidden";
    el.style.height = `${el.getBoundingClientRect().height}px`;

    // It goes out where it stands. An earlier version drifted it downward and
    // answered that with the row sliding in from above, on the theory that a
    // shared direction would read as one movement. In practice the text
    // visibly travelled, which is more distracting than the pop it replaced.
    el.style.transition = `opacity ${FADE_MS}ms ease`;
    el.style.opacity = "0";

    // Late, and only if the list has not already closed this card with a
    // measured lift. Sixty milliseconds of slack so the commit that inserts
    // the row always gets there first when there is a row to insert.
    const fallback = setTimeout(() => beginCardClose(el, 0), FADE_MS + 60);

    // Cancelling only the timer would leave the element stuck at whatever
    // opacity and height it had reached — invisible, or half-closed.
    return () => {
      clearTimeout(fallback);
      delete el.dataset.closing;
      el.removeAttribute("style");
    };
  }, [ref, active]);
}

/**
 * The arrival: full height from the first frame, contents last.
 *
 * There is no height animation here any more, and that is the fix rather than
 * an omission. The row's height is handed to it by the collapsing card above
 * (see `useCollapseOut`), so it can simply exist at its natural size without
 * the list moving — and a row that does not resize also cannot be dragged
 * upward while it resizes, which is what the growing version did.
 *
 * What is left is the frame arriving before what it holds: the status rail
 * fades in quickly, and the text follows once the settle above has finished.
 */
export function useRevealIn(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active || prefersReduced()) return;

    const contents = contentsOf(el);
    const frames = Array.from(el.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.dataset.rowFrame !== undefined,
    );

    for (const child of contents) child.style.opacity = "0";
    for (const frame of frames) frame.style.opacity = "0";

    const framing = requestAnimationFrame(() => {
      for (const frame of frames) {
        frame.style.transition = `opacity 160ms ease`;
        frame.style.opacity = "1";
      }
    });

    // Held until the card above has finished closing: text that resolves while
    // the whole section is still settling upward is text that appears to move.
    const showing = setTimeout(() => {
      for (const child of contents) {
        child.style.transition = `opacity ${FADE_MS}ms ease`;
        child.style.opacity = "1";
      }
    }, SIZE_MS);

    const done = setTimeout(() => {
      for (const child of contents) child.removeAttribute("style");
      for (const frame of frames) frame.removeAttribute("style");
    }, SIZE_MS + FADE_MS);

    return () => {
      cancelAnimationFrame(framing);
      clearTimeout(showing);
      clearTimeout(done);
      // An interrupted reveal must not leave the row's contents transparent.
      for (const child of contents) child.removeAttribute("style");
      for (const frame of frames) frame.removeAttribute("style");
    };
  }, [ref, active]);
}
