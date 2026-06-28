// Melbourne-timezone helpers that correctly account for daylight saving
// (AEDT = UTC+11 in summer, AEST = UTC+10 in winter).

const TZ = "Australia/Melbourne";

// Convert a Melbourne wall-clock time to the matching UTC Date, handling DST.
function melbourneWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Treat the wall-clock as if it were UTC, then correct by Melbourne's offset
  // at that instant.
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const probe = new Date(asIfUtc);
  const melStr = probe.toLocaleString("en-US", { timeZone: TZ });
  const utcStr = probe.toLocaleString("en-US", { timeZone: "UTC" });
  const offset = new Date(melStr).getTime() - new Date(utcStr).getTime();
  return new Date(asIfUtc - offset);
}

/**
 * Returns the next "Thursday 8:00pm Melbourne" as a UTC Date.
 * If it's already past this week's Thursday 8pm, returns next week's.
 */
export function nextThursday8pmMelbourne(from: Date = new Date()): Date {
  for (let i = 0; i < 14; i++) {
    const cand = new Date(from.getTime() + i * 86400000);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(cand);
    if (weekday !== "Thu") continue;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(cand);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    const target = melbourneWallTimeToUtc(y, m, d, 20, 0);
    if (target.getTime() > from.getTime()) return target;
  }
  // Fallback (should not happen): one week out.
  return new Date(from.getTime() + 7 * 86400000);
}

/** Human label like "Thu, 18 Jun, 8:00 pm AEST" for a UTC instant. */
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
