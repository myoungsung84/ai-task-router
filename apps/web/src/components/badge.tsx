import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "reviewing" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  brand: "bg-brand/10 text-brand",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  reviewing: "bg-reviewing/10 text-reviewing",
  neutral: "bg-fg/[0.07] text-fg-muted",
};

/**
 * The one chip primitive for status, severity, and tag-style labels — and
 * one of only two places in the app allowed to be fully rounded (see the
 * "Shape" block in globals.css). It's a token, not a control: it never
 * takes a click, so the pill shape reads as "a value" rather than "a
 * button". `icon` is a slot (not baked in) so callers pass a lucide icon or
 * a small glyph — status is never color-only, see the composed
 * *StatusBadge helpers.
 */
export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
  pulse = false,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Subtle pulse on the icon slot — used for "actively happening right now" states (RUNNING/REVIEWING). */
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className={cn("inline-flex", pulse && "motion-safe:animate-pulse")}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
