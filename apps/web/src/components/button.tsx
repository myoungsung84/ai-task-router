import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "bg-fg/[0.08] text-fg hover:bg-fg/[0.13]",
  outline: "border border-border text-fg-secondary hover:border-border-strong hover:text-fg",
  danger: "bg-danger-strong text-white hover:bg-danger-strong/90",
  ghost: "text-fg-muted hover:bg-fg/[0.07] hover:text-fg",
};

/**
 * Fixed heights, not padding-derived ones — a row that mixes a button, an
 * input and a select must line up exactly, and that only holds if all three
 * agree on `h-8 / h-9 / h-10` (see globals.css "Control heights").
 */
const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4 text-sm",
  lg: "h-10 gap-2 px-5 text-sm",
};

/**
 * Disabled swaps the variant's fill for one neutral treatment rather than
 * fading it — a 45%-opacity brand button puts white on pale blue, which in
 * the light theme leaves the label at ~1.4:1 and reads as a rendering bug
 * rather than as "not available yet". Muted surface plus `fg-faint` text
 * stays legible in both themes while still being unmistakably inactive.
 */
const DISABLED_CLASS =
  "disabled:cursor-not-allowed disabled:bg-fg/[0.06] disabled:text-fg-faint disabled:shadow-none disabled:hover:bg-fg/[0.06] disabled:hover:text-fg-faint";

/**
 * `rounded-md` across every variant and size. A button is a control, not a
 * token — the pill shape in this app is reserved for `Badge` and the
 * segmented status filter (see the "Shape" block in globals.css), so a
 * primary call-to-action and a quiet ghost action read as the same family.
 */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    icon?: ReactNode;
  }
>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        DISABLED_CLASS,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : icon ? (
        <span aria-hidden className="inline-flex">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
});

/** Icon-only button (close, copy, delete, …) — same interaction states and radius as Button, sized to the same control heights. Always pass `label` for a11y since there's no visible text. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    size?: Size;
    variant?: Variant;
  }
>(function IconButton(
  { label, size = "md", variant = "ghost", className, children, ...props },
  ref,
) {
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-10 w-10" : "h-9 w-9";
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        DISABLED_CLASS,
        box,
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
