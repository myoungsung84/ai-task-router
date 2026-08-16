import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/format";
import type { Tone } from "./badge";

const WASH_CLASS: Record<Tone, string> = {
  brand: "bg-brand/[0.06]",
  success: "bg-success/[0.06]",
  warning: "bg-warning/[0.08]",
  danger: "bg-danger/[0.07]",
  info: "bg-info/[0.06]",
  reviewing: "bg-reviewing/[0.06]",
  neutral: "bg-fg/[0.035]",
};

const ACCENT_CLASS: Record<Tone, string> = {
  brand: "before:bg-brand",
  success: "before:bg-success",
  warning: "before:bg-warning",
  danger: "before:bg-danger",
  info: "before:bg-info",
  reviewing: "before:bg-reviewing",
  neutral: "before:bg-fg/20",
};

const ICON_CLASS: Record<Tone, string> = {
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  reviewing: "text-reviewing",
  neutral: "text-fg-muted",
};

const DEFAULT_ICON: Partial<Record<Tone, ReactNode>> = {
  success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden />,
  danger: <XCircle className="h-4 w-4" aria-hidden />,
  info: <Info className="h-4 w-4" aria-hidden />,
};

/**
 * The one banner/callout primitive — success confirmations, WARNING review
 * summaries, error messages, and neutral notices all render through this
 * instead of a bespoke bordered box per call site. A soft tinted wash + a
 * colored left flag (not a full colored border) keeps it reading as "a
 * highlighted paragraph in the page" rather than a boxed system-dialog
 * alert. `title` is the one-glance headline ("검토 완료, 문제 없음");
 * `children` carries the detail/body; `actions` is a slot for follow-up
 * buttons rendered inline with the content, not bolted on separately.
 */
export function Alert({
  tone = "neutral",
  icon,
  title,
  children,
  actions,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const resolvedIcon = icon ?? DEFAULT_ICON[tone];
  return (
    <div
      className={cn(
        "relative rounded-lg py-3.5 pl-4 pr-4 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px] before:rounded-l-lg before:content-['']",
        WASH_CLASS[tone],
        ACCENT_CLASS[tone],
        className,
      )}
    >
      <div className="flex gap-2.5">
        {resolvedIcon ? (
          <span className={cn("mt-0.5 shrink-0", ICON_CLASS[tone])}>{resolvedIcon}</span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-2">
          {title ? <div className="text-sm font-semibold text-fg">{title}</div> : null}
          {children ? (
            <div className="text-sm leading-relaxed text-fg-secondary">{children}</div>
          ) : null}
          {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
