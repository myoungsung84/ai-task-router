"use client";

import { Moon, Sun } from "lucide-react";
import { IconButton } from "./button";
import { useTheme } from "@/lib/theme";

/**
 * Both glyphs are always in the DOM; `.icon-when-dark` / `.icon-when-light`
 * (globals.css) show exactly one based on `data-theme`, which the inline
 * theme script has already set before first paint. So the right icon is
 * painted immediately and never swaps once React hydrates.
 *
 * The icon shows the theme the button will switch *to* — sun while dark,
 * moon while light — and the accessible name says so outright. Before mount
 * the name falls back to a neutral "테마 전환", identical on server and
 * client, so hydration has nothing to reconcile.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label =
    theme === null ? "테마 전환" : theme === "light" ? "다크 테마로 전환" : "라이트 테마로 전환";

  return (
    <IconButton label={label} onClick={toggle}>
      <Sun className="icon-when-dark h-4 w-4" aria-hidden />
      <Moon className="icon-when-light h-4 w-4" aria-hidden />
    </IconButton>
  );
}
