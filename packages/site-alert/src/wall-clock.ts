/**
 * Wall-clock strings ("YYYY-MM-DDTHH:mm") in a configured IANA timezone.
 *
 * Alert windows are stored as LOCAL wall-clock strings, not instants, and
 * every comparison is a plain string compare against the current wall clock
 * in the same zone. That keeps DST out of it entirely and lets the start/end
 * check run in the visitor's browser: a scheduled alert appears and expires on
 * time with no rebuild.
 */

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface WallParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  /** 0 = Sunday. */
  dow: number;
}

/** True for a real calendar date + time in `YYYY-MM-DDTHH:mm` form. */
export function isWallClock(v: unknown): v is string {
  const m = typeof v === 'string' ? WALL_RE.exec(v) : null;
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d &&
    h < 24 &&
    mi < 60
  );
}

/** Split a valid wall-clock string. Throws on an invalid one. */
export function wallParts(w: string): WallParts {
  const m = WALL_RE.exec(w);
  if (!m) throw new Error(`not a wall-clock string: ${w}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return { y, mo, d, h, mi, dow: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() };
}

/** The current wall clock in `timeZone` as `YYYY-MM-DDTHH:mm`. Throws a
 *  RangeError for an unknown zone (Intl's behaviour); callers in the browser
 *  should treat a throw as "do not show". */
export function wallClockIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  // Some engines render midnight as "24" even with h23; normalise.
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

/** Add whole days to a wall-clock string (calendar arithmetic, no zone). */
export function addDays(w: string, n: number): string {
  const p = wallParts(w);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d + n, p.h, p.mi)).toISOString().slice(0, 16);
}
