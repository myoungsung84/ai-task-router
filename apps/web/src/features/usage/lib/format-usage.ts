import { kstDateString } from "@/lib/format";

/** `12.4k` / `11.0M` — the row has one column for this, so it never wraps. */
export function formatTokens(tokens: number | null): string {
  if (tokens === null) return "-";
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/**
 * The short account label for the row: an email's local part.
 *
 * Not the profile name, which is what it looks like it should be — both CLIs
 * happen to be signed in under the same person's name here, so the names are
 * identical and identify nothing. `bi99` vs `myoungsung84` is what actually
 * says "this is the work account and that is the personal one", which is the
 * only question this column exists to answer.
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
