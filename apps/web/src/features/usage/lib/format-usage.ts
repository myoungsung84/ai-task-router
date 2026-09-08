import { kstDateString } from "@/lib/format";

/**
 * `1.2만` / `3200만` / `2.1억` — Korean myriad grouping, not k/M.
 *
 * Korean reads large numbers in units of 만(10⁴) and 억(10⁸), so "208.2M" has
 * to be converted in the head before it means anything. Precision follows the
 * unit rather than a fixed number of decimals: once a figure is in the
 * hundreds of 만, a decimal place is noise, and one place is what makes 억
 * readable at all.
 *
 * The row has one column for this, so it never wraps.
 */
export function formatTokens(tokens: number | null): string {
  if (tokens === null) return "-";
  const EOK = 100_000_000;
  const MAN = 10_000;
  if (tokens >= EOK) return `${(tokens / EOK).toFixed(1)}억`;
  if (tokens >= 100 * MAN) return `${Math.round(tokens / MAN)}만`;
  if (tokens >= MAN) return `${(tokens / MAN).toFixed(1)}만`;
  return String(tokens);
}

/**
 * The short account label for the row: an email's local part.
 *
 * Not the profile name, which is what it looks like it should be. One person
 * signed into both CLIs has the same name on both, so the names are identical
 * and identify nothing; the email local parts differ, and telling a work
 * account from a personal one is the only question this column exists to
 * answer.
 */
export function shortAccount(email: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0] ?? email;
  return local.length > 16 ? `${local.slice(0, 15)}…` : local;
}

function kstParts(iso: string): { month: string; day: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/**
 * `9/5 13:07` — when a window rolls over, as a wall-clock moment rather than a
 * countdown. A countdown answers "how long do I wait"; a date answers "can I
 * still get this done before lunch", which is the question actually being asked
 * of a plan limit.
 */
export function formatResetAt(iso: string | null): string {
  if (!iso) return "-";
  const { month, day, hour, minute } = kstParts(iso);
  return `${month}/${day} ${hour}:${minute}`;
}

/**
 * `07:32 기준` today, `9/4 18:04 기준` before that.
 *
 * Explicitly labelled in Korean rather than an English "2m ago": the row
 * carries three other times, and a bare relative age leaves the reader working
 * out *what* happened then. This one says what it is.
 */
export function formatObservedAt(iso: string | null): string {
  if (!iso) return "기준 시각 없음";
  const { month, day, hour, minute } = kstParts(iso);
  const sameDay = kstDateString(new Date(iso)) === kstDateString(new Date());
  return sameDay ? `${hour}:${minute} 기준` : `${month}/${day} ${hour}:${minute} 기준`;
}

/** Hours since the reading was taken; `null` when there is no reading. */
export function ageHours(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 3_600_000;
}

/**
 * `5h` / `7d` — the window's own length, from what the CLI reported.
 *
 * The two windows used to be labelled from hardcoded field names, which said
 * "5h" whether or not that was the length the CLI had actually given. When a
 * length is missing the label says so (`?`) instead of picking one.
 */
export function formatWindowLabel(windowMinutes: number | null): string {
  if (windowMinutes === null || windowMinutes <= 0) return "?";
  if (windowMinutes < 60) return `${windowMinutes}m`;
  if (windowMinutes < 1440) return `${Math.round(windowMinutes / 60)}h`;
  return `${Math.round(windowMinutes / 1440)}d`;
}

/** `18%`, or `미확인` when there is no reading. Never renders a missing value as 0%. */
export function formatPercent(value: number | null): string {
  return value === null ? "미확인" : `${Math.round(value)}%`;
}
