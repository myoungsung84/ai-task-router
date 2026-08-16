"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "ai-task-router:theme";

/**
 * Runs inline in the document, before the browser paints anything, and
 * stamps `data-theme` onto <html>. That ordering is the whole point: the
 * palette lives in CSS custom properties keyed off that attribute, so
 * resolving the theme in React (after hydration) would mean one frame of the
 * default theme on every load — the classic flash. Reading `localStorage`
 * synchronously here is exactly the trade this is worth.
 *
 * Precedence: an explicit stored choice wins; otherwise follow the OS. Both
 * reads are wrapped because `localStorage` throws outright in some privacy
 * modes, and a theme is never worth breaking the page over.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var s=localStorage.getItem(k);var t=s==="light"||s==="dark"?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

/**
 * Flips the attribute with every CSS transition suppressed for one frame.
 *
 * Not cosmetic: most controls in this app carry `transition-colors`, and
 * their color resolves through a custom property (`text-fg-muted` →
 * `rgb(var(--fg-muted))`). Chromium does not re-evaluate a transitioned
 * property when the custom property behind it changes, so those elements
 * keep painting the *old* palette after a switch while every
 * non-transitioning element updates — the header icons and tab labels end
 * up in dark-theme grey on a light page. Disabling transitions around the
 * attribute write forces a clean recalculation, and as a bonus the whole
 * page swaps at once instead of cross-fading channel by channel.
 */
function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", next);
  // Read a layout property to flush the style change while transitions are
  // still off; without this the class removal below could be batched into
  // the same frame and re-enable them too early.
  void root.offsetHeight;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => root.classList.remove("theme-switching"));
  });
}

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function storedTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * `theme` is `null` until the component has mounted — the server has no way
 * to know which theme the inline script picked, so anything rendered from it
 * has to stay identical on both sides of hydration. Visual state does *not*
 * depend on this (CSS keys off `data-theme` directly); it's only for the
 * button's accessible name.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setThemeState(current === "light" ? "light" : "dark");
  }, []);

  // Keep following the OS as long as the user hasn't made a choice of their
  // own — once they have, their pick outranks the system for good.
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return;
    const onChange = () => {
      if (storedTheme()) return;
      const next = systemTheme();
      applyTheme(next);
      setThemeState(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Persisting is best-effort; the switch itself already applied.
    }
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    const current =
      document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    setTheme(current === "light" ? "dark" : "light");
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
