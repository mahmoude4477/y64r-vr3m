// "Last active" of a session, by calendar day in the app's time zone. Better Auth refreshes a session row (its
// updatedAt) at most once a day (session.updateAge in lib/auth.ts), so a finer label ("3 minutes ago") would claim
// a precision the data does not have. Client-safe and pure.

/** "YYYY-MM-DD" of `date` in `timeZone` (en-CA formats dates in that order). */
function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Whole calendar days from `date` to `now` in `timeZone`: 0 = the same day, 1 = the day before, … A date after `now`
 * (clock skew between the database and the app) counts as 0.
 */
export function calendarDaysAgo(date: Date, now: Date, timeZone: string): number {
  const [a, b] = [dayKey(date, timeZone), dayKey(now, timeZone)].map((key) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
