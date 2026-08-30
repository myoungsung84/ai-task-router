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

function prefersReduced(): boolean {
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

/** Fade, then close the gap. Total ≈ 720ms; keep `SETTLE_MS` at or above it. */
export function useCollapseOut(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  /**
   * The height the arriving 완료 row will occupy, handed back the instant it
   * appears. See the note in phase two.
   */
  liftPx = 0,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active || prefersReduced()) return;

    const height = el.getBoundingClientRect().height;
    el.style.overflow = "hidden";
    el.style.height = `${height}px`;

    // Phase one: it goes out where it stands. An earlier version drifted it
    // downward and answered that with the row sliding in from above, on the
    // theory that a shared direction would read as one movement. In practice
    // the text visibly travelled, which is more distracting than the pop it
    // replaced — the space closing and opening already carries the direction.
    el.style.transition = `opacity ${FADE_MS}ms ease`;
    el.style.opacity = "0";

    // Phase two, once it is invisible: the space closes. Collapsing while it
    // is still legible reads as the row being yanked downward.
    //
    // This is also the moment the arriving row starts growing — the list
    // holds the Task in both places for exactly this window (see
    // `useTaskTransitions`). Run in sequence instead, the rows below travelled
    // 108px up and then 52px back down; overlapped, they make one move.
    const closing = setTimeout(() => {
      /*
       * The arriving row appears at its full height on this same beat, and
       * this is where its space comes from.
       *
       * Growing the row instead — the previous version — made it travel. The
       * row sits below this card, so every pixel this card gives up pulls the
       * row upward: measured, its frame climbed 108px over the 380ms it spent
       * growing 52px, which is why the arrival read as awkward while the exit,
       * which never moves, read as fine. Handing back exactly the row's height
       * in one invisible step (the card's contents are already fully faded, so
       * this box has nothing left to see) means the insertion costs the list
       * nothing, and the only motion left is one uniform settle upward as the
       * remainder closes.
       */
      const remaining = Math.max(0, height - liftPx);
      el.style.transition = "none";
      el.style.height = `${remaining}px`;
      // Forces the browser to take the step above as a starting point rather
      // than collapsing it into the transition that follows.
      void el.offsetHeight;

      el.style.transition = `height ${SIZE_MS}ms ${EASE_SIZE}, padding ${SIZE_MS}ms ${EASE_SIZE}`;
      el.style.height = "0px";
      el.style.paddingTop = "0px";
      el.style.paddingBottom = "0px";
      el.style.borderTopColor = "transparent";
    }, FADE_MS);

    // Cancelling only the timer would leave the element stuck at whatever
    // opacity and height it had reached — invisible, or half-closed.
    return () => {
      clearTimeout(closing);
      el.removeAttribute("style");
    };
  }, [ref, active, liftPx]);
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
