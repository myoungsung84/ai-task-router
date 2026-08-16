import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/format";

/**
 * Vertical room these placeholders take. A prop rather than a `py-*` class
 * passed through `className`: Tailwind emits padding utilities in scale
 * order, not in the order they appear in the attribute, so a caller's
 * `py-8` would silently lose to a built-in `py-12` and the override would
 * look like it did nothing.
 */
const PAD = { md: "py-12", sm: "py-8" };

/** Centered "nothing here yet" placeholder — icon + message + optional action, used by every list/panel that can legitimately be empty instead of each screen writing its own `<p className="text-sm text-...">...</p>`. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  padding = "md",
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  padding?: keyof typeof PAD;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 text-center",
        PAD[padding],
        className,
      )}
    >
      <span className="text-fg-faint" aria-hidden>
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <p className="text-sm font-medium text-fg-secondary">{title}</p>
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Inline "불러오는 중" — spinner + label, replaces the bare `<p>` loading text scattered around the app. */
export function LoadingState({
  label = "불러오는 중",
  padding = "sm",
  className,
}: {
  label?: string;
  padding?: keyof typeof PAD;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-fg-muted", PAD[padding], className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/** Inline error banner for a failed fetch — icon + message + optional retry, in the danger tone. */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-lg bg-danger/[0.06] px-4 py-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {message}
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
