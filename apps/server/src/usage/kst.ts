/**
 * Asia/Seoul calendar-day helpers for the usage collectors.
 *
 * `daily-summary-service.ts` has its own `kstDateOf` and deliberately keeps it
 * private; this one is kept separate for the same reason that one is — the two
 * answer different questions (that one buckets Tasks by creation date, this one
 * decides whether a CLI's log line belongs to today) and neither should start
 * dragging the other's concerns along.
 */

function kstDateOf(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** `YYYY-MM-DD` in Asia/Seoul for the given instant. */
export function kstDay(date: Date): string {
  return kstDateOf(date);
}

/** True when `date` falls on today's Asia/Seoul calendar day. */
export function isToday(date: Date): boolean {
  return kstDateOf(date) === kstDateOf(new Date());
}

/**
 * The instant today (Asia/Seoul) began, as epoch ms. Used only to skip files
 * whose mtime predates it — a coarse filter, so it is allowed to be an hour
 * generous rather than exact around DST-free Seoul's fixed +09:00.
 */
export function startOfTodayMs(): number {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const midnightUtcOfKstDay = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  );
  return midnightUtcOfKstDay - 9 * 60 * 60 * 1000;
}
