import type { AgentName } from "@/features/tasks/types";
import { cn } from "@/lib/format";

/**
 * Claude/Codex's visual identity across the whole app — every place an Agent
 * is shown (role cards, workflow steps, task rows, activity log) uses these
 * same two marks, never emoji or ad-hoc text. Both are original, simple
 * single-path glyphs (not a reproduction of either company's wordmark/logo)
 * chosen to read clearly at 14–16px on a transparent background:
 *   - Claude: a soft four-point spark — a generic "assistant" glyph, warm.
 *   - Codex: code brackets `</>` — reads as "this one writes/reviews code".
 * Color comes from `currentColor` so callers set it via a text-agent-* class
 * (see AgentAvatar for the common badge treatment) instead of each glyph
 * hardcoding its own fill.
 */
export function AgentIcon({
  agent,
  className,
  size = 16,
}: {
  agent: AgentName;
  className?: string;
  size?: number;
}) {
  if (agent === "claude") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M12 1.5c.5 0 .93.35 1.03.84l1.03 4.9a5.6 5.6 0 0 0 3.7 3.7l4.9 1.03a1.05 1.05 0 0 1 0 2.06l-4.9 1.03a5.6 5.6 0 0 0-3.7 3.7l-1.03 4.9a1.05 1.05 0 0 1-2.06 0l-1.03-4.9a5.6 5.6 0 0 0-3.7-3.7l-4.9-1.03a1.05 1.05 0 0 1 0-2.06l4.9-1.03a5.6 5.6 0 0 0 3.7-3.7l1.03-4.9c.1-.49.53-.84 1.03-.84Z"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9 6-5.5 6L9 18M15 6l5.5 6L15 18"
      />
    </svg>
  );
}

const AGENT_TEXT_CLASS: Record<AgentName, string> = {
  claude: "text-agent-claude",
  codex: "text-agent-codex",
};

const AGENT_BG_CLASS: Record<AgentName, string> = {
  claude: "bg-agent-claude/15",
  codex: "bg-agent-codex/15",
};

/** Circular badge combining the mark + its brand-tinted background — the "who's doing this" building block used on role cards, task rows, and the workflow timeline. */
export function AgentAvatar({
  agent,
  size = "md",
  className,
}: {
  agent: AgentName;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "sm" ? "h-6 w-6" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const icon = size === "sm" ? 12 : size === "lg" ? 20 : 15;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        box,
        AGENT_BG_CLASS[agent],
        AGENT_TEXT_CLASS[agent],
        className,
      )}
    >
      <AgentIcon agent={agent} size={icon} />
    </span>
  );
}
