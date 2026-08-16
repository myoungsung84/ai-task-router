import localFont from "next/font/local";

/**
 * Pretendard Variable, self-hosted (see `src/fonts/pretendard/README.md` for
 * the exact source/version and `LICENSE.txt` for the SIL OFL 1.1 terms) and
 * served through `next/font/local` — no CDN request at runtime, and Next.js
 * inlines the `@font-face` + preloads the file automatically. `weight: "45
 * 920"` matches Pretendard's own variable `wght` axis range (confirmed
 * against its published `@font-face` CSS), so every weight from Thin to
 * Black is available through one file instead of needing separate static
 * weight files.
 */
export const pretendard = localFont({
  src: "../fonts/pretendard/PretendardVariable.woff2",
  variable: "--font-sans",
  weight: "45 920",
  display: "swap",
  // Same fallback stack the app used before Pretendard — keeps text
  // legible immediately, before/if the variable font finishes loading.
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});
