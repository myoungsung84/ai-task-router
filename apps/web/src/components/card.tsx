import type { ReactNode } from "react";
import { cn } from "@/lib/format";

type Variant = "wash" | "outline" | "plain";
type Tone = "default" | "brand" | "success" | "warning" | "danger";

const WASH_CLASS: Record<Tone, string> = {
  default: "bg-fg/[0.035]",
  brand: "bg-brand/[0.06]",
  success: "bg-success/[0.06]",
  warning: "bg-warning/[0.07]",
  danger: "bg-danger/[0.06]",
};

const ACCENT_CLASS: Record<Tone, string> = {
  default: "before:bg-fg/20",
  brand: "before:bg-brand",
  success: "before:bg-success",
  warning: "before:bg-warning",
  danger: "before:bg-danger",
};

/**
 * A grouping surface at `rounded-lg` — one radius step above a control, one
 * below a floating layer. Exactly one of wash / outline carries the
 * boundary: a tinted fill *and* a border *and* a shadow on the same box is
 * the thing this app deliberately avoids. Content that doesn't need a
 * boundary at all shouldn't use Card — whitespace plus a section label is
 * the default grouping mechanism. `accent` swaps the boundary for a single
 * colored left flag, for "this needs attention" without a boxed-alert look.
 */
export function Card({
  children,
  className,
  title,
  eyebrow,
  variant = "wash",
  tone = "default",
  accent = false,
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  /** Small uppercase label above the title, e.g. "리뷰", "결과". */
  eyebrow?: ReactNode;
  variant?: Variant;
  tone?: Tone;
  accent?: boolean;
  padding?: "md" | "sm" | "none";
}) {
  return (
    <div
      className={cn(
        "rounded-lg",
        variant === "wash" && WASH_CLASS[tone],
        variant === "outline" && "border border-border",
        accent &&
          "relative pl-4 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-r-sm before:content-['']",
        accent && ACCENT_CLASS[tone],
        padding === "md" && "p-4",
        padding === "sm" && "p-3",
        className,
      )}
    >
      {eyebrow ? (
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {eyebrow}
        </div>
      ) : null}
      {title ? <div className="mb-3 text-sm font-medium text-fg-secondary">{title}</div> : null}
      {children}
    </div>
  );
}

/**
 * The one section-heading style in the app: small, uppercase, `fg-muted`
 * (never `fg-faint` — a heading you can barely see stops being a heading).
 * Every screen labels its regions with this rather than each inventing its
 * own size/weight/color combination.
 */
export function SectionLabel({
  children,
  as: Tag = "h2",
  uppercase = true,
  className,
}: {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  /** Off for labels that embed a proper noun — "Claude 구현 결과" must not render as "CLAUDE 구현 결과". */
  uppercase?: boolean;
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "text-xs font-semibold tracking-wider text-fg-muted",
        uppercase && "uppercase",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
