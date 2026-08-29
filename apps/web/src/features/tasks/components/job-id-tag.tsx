import { cn } from "@/lib/format";

/**
 * The Job ID (T-18) as a real, findable tag.
 *
 * It used to sit inside a run of faint metadata under the title, in the same
 * weight and colour as the outcome text beside it — so "which Task number was
 * that" meant reading every row rather than scanning one column. It is the
 * handle people actually use to refer to a Task in chat, in MCP calls and to
 * each other, so it gets its own boxed, monospaced tag with a stable width and
 * enough contrast to scan down.
 */
export function JobIdTag({
  jobId,
  size = "sm",
  className,
}: {
  jobId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mono inline-flex shrink-0 items-center justify-center rounded-sm",
        "bg-fg/[0.07] font-medium tabular-nums text-fg-secondary",
        size === "md"
          ? "h-6 min-w-[3.25rem] px-1.5 text-xs"
          : "h-5 min-w-[3rem] px-1.5 text-[11px]",
        className,
      )}
    >
      {jobId}
    </span>
  );
}
