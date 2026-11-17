/** Calendar helpers in a named IANA timezone (the business timezone). */

export interface CalendarDate {
  y: number;
  m: number;
  d: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(t: number, tz: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(new Date(t))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** The calendar date of an instant in `tz`. A form sent at 9pm on the US west
 *  coast is a UTC "tomorrow"; bucketing it there would move evening enquiries
 *  into the next week or month. */
export function calendarDate(iso: string, tz: string): CalendarDate | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p = parts(t, tz);
  if (!p.year || !p.month || !p.day) return null;
  return { y: p.year, m: p.month, d: p.day };
}

/** Offset of `tz` from UTC at instant `t`, in ms. */
function offsetMs(t: number, tz: string): number {
  const p = parts(t, tz);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour === 24 ? 0 : p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** The UTC instant of local midnight on (y, m, d) in `tz`. m is 1-based and
 *  may overflow (13 → January next year), as with Date.UTC. */
export function zonedMidnight(y: number, m: number, d: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(guess, tz);
  // Re-check across a DST change between the guess and the answer.
  const again = guess - offsetMs(t, tz);
  if (again !== t) t = again;
  return t;
}
