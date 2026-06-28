// Melbourne-timezone helpers that correctly account for daylight saving
// (AEDT = UTC+11 in summer, AEST = UTC+10 in winter).

const TZ = "Australia/Melbourne";

const SHORT_TO_NUM: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// 0 = Sunday ... 6 = Saturday
export const WEEKDAY_NUM: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Convert a Melbourne wall-clock time to the matching UTC Date, handling DST.
function melbourneWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const probe = new Date(asIfUtc);
  const melStr = probe.toLocaleString("en-US", { timeZone: TZ });
  const utcStr = probe.toLocaleString("en-US", { timeZone: "UTC" });
  const offset = new Date(melStr).getTime() - new Date(utcStr).getTime();
  return new Date(asIfUtc - offset);
}

/**
 * Returns the next occurrence of "<weekday> <hour>:<minute> Melbourne" as a UTC
 * Date. If this week's slot is already past, returns next week's.
 * @param weekday 0=Sunday ... 6=Saturday
 */
export function nextWeekdayTimeMelbourne(weekday: number, hour: number, minute: number, from: Date = new Date()): Date {
  for (let i = 0; i < 14; i++) {
    const cand = new Date(from.getTime() + i * 86400000);
    const wdShort = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(cand);
    if (SHORT_TO_NUM[wdShort] !== weekday) continue;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(cand);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    const target = melbourneWallTimeToUtc(y, m, d, hour, minute);
    if (target.getTime() > from.getTime()) return target;
  }
  return new Date(from.getTime() + 7 * 86400000);
}

/** Next "Thursday 8:00pm Melbourne" as a UTC Date. */
export function nextThursday8pmMelbourne(from: Date = new Date()): Date {
  return nextWeekdayTimeMelbourne(4, 20, 0, from);
}

/** Human label like "Thu, 18 Jun, 8:00 pm" for a UTC instant, in Melbourne time. */
export function melbourneLabel(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-AU", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
