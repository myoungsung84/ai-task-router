import type { LogEntry } from "../types";

/**
 * Picks and phrases the one log line worth showing under a running Task.
 *
 * Showing simply the newest agent line surfaces whatever the runner printed
 * last, which for a review Step is almost always its own shell plumbing —
 * `(exit 0) "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content
 * -Raw 'apps/web/...'"` — or, at the very end, the raw JSON review payload.
 * Both are true statements about the process and neither says anything about
 * the work.
 *
 * The agents genuinely do not narrate: in a real review run there is often no
 * prose at all. So rather than hunting for sentences that are not there, a
 * recognised command is rewritten into what it was for ("읽는 중 · title.ts"),
 * and only unrecognised output falls through as-is. Prose still wins when it
 * exists.
 */

/** Runner bookkeeping — a shell invocation, an exit echo, a bare path. */
const MACHINERY = [
  /^\(exit\s+-?\d+\)/i,
  /^\s*[$>#]\s/,
  /^[A-Za-z]:[\\/]/,
  /\.exe\b/i,
  /^(?:npm|pnpm|yarn|git|node|tsc|bash|sh|cmd|pwsh|powershell)\b/i,
];

/** Structured payloads: real output, but not a sentence for a one-line footer. */
const STRUCTURED = [/^[[{]/, /^</];

/**
 * No informational content at any priority: separators, bare timestamps, and
 * the flag documentation a CLI prints when it is invoked wrong ("--output
 * <file> output to a specific file"), which otherwise reads as a real sentence.
 */
const IGNORABLE = [
  /^[\s\-=_*·•]+$/,
  /^\[?\d{2}:\d{2}(:\d{2})?\]?$/,
  /^\s*-{1,2}[A-Za-z][\w-]*(?:[\s,]|$)/,
  /^usage:/i,
];

/**
 * Command → what it was doing. Ordered: the first match wins, so more specific
 * patterns (a git subcommand) precede general ones (any quoted path).
 */
const INTENTS: { pattern: RegExp; phrase: (m: RegExpMatchArray) => string }[] = [
  { pattern: /\bgit\b[^"']*\bdiff\b/i, phrase: () => "변경 사항 확인 중" },
  { pattern: /\bgit\b[^"']*\b(?:log|show)\b/i, phrase: () => "커밋 기록 확인 중" },
  { pattern: /\bgit\b[^"']*\bstatus\b/i, phrase: () => "작업 트리 확인 중" },
  {
    pattern: /\b(?:Select-String|rg|grep)\b[^\n]*?['"]([^'"\n]+)['"]/i,
    phrase: (m) => `검색 중 · ${leaf(m[1]!)}`,
  },
  { pattern: /\b(?:Select-String|rg|grep)\b/i, phrase: () => "검색 중" },
  {
    pattern: /\b(?:Get-Content|cat|type|head|tail)\b[^\n]*?['"]([^'"\n]+)['"]/i,
    phrase: (m) => `읽는 중 · ${leaf(m[1]!)}`,
  },
  {
    pattern: /\b(?:Get-ChildItem|ls|dir|find)\b[^\n]*?['"]([^'"\n]+)['"]/i,
    phrase: (m) => `탐색 중 · ${leaf(m[1]!)}`,
  },
  { pattern: /\b(?:Get-ChildItem|ls|dir|find)\b/i, phrase: () => "탐색 중" },
  { pattern: /\b(?:tsc|typecheck)\b/i, phrase: () => "타입 검사 중" },
  { pattern: /\b(?:eslint|lint)\b/i, phrase: () => "린트 중" },
  { pattern: /\b(?:vitest|jest|pytest|test)\b/i, phrase: () => "테스트 실행 중" },
];

function leaf(pathLike: string): string {
  const parts = pathLike.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || pathLike;
}

/**
 * Collapses whitespace and unescapes the doubled backslashes a Windows command
 * line picks up on its way through JSON, so anything that does get shown reads
 * as a path rather than as an escape sequence.
 */
export function tidyLogText(text: string): string {
  return text.replace(/\\\\/g, "\\").replace(/\s+/g, " ").trim();
}

function isMachinery(text: string): boolean {
  return MACHINERY.some((re) => re.test(text));
}

/** Rewrites a command into its purpose, or null when nothing is recognised. */
export function describeCommand(text: string): string | null {
  for (const { pattern, phrase } of INTENTS) {
    const m = text.match(pattern);
    if (m) return phrase(m);
  }
  return null;
}

/**
 * The newest usable line wins, rewritten if it is a recognised command.
 *
 * Recency beats prose deliberately. An earlier draft preferred any sentence
 * over any command, and on a real review run that surfaced a two-minute-old
 * fragment of a CLI's help text while the agent was actively reading files —
 * older, and less true. This line answers "what is happening now", so the
 * newest thing that carries meaning is the right answer even when that thing
 * is a command.
 */
export function pickLogLine(logs: LogEntry[]): string | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i]!;
    if (log.source === "system") continue;

    const text = tidyLogText(log.text);
    if (!text || IGNORABLE.some((re) => re.test(text))) continue;
    // Real output, but a JSON/XML payload is not a sentence for a footer.
    if (STRUCTURED.some((re) => re.test(text))) continue;

    if (isMachinery(text)) {
      const intent = describeCommand(text);
      // An unrecognised command is skipped rather than printed raw: the raw
      // form is the noise this function exists to remove.
      if (intent) return intent;
      continue;
    }

    return truncate(text);
  }

  return null;
}

const MAX = 140;
function truncate(text: string): string {
  return text.length <= MAX ? text : text.slice(0, MAX - 1).trimEnd() + "…";
}
