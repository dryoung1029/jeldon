import { calendarDate, zonedMidnight, type CalendarDate } from './time.js';

/**
 * Lead metrics over time, computed retroactively from the leads themselves
 * (each lead carries its own dates, status and channel), so the full history
 * is available on day one with nothing snapshotted.
 *
 * Two things exist to stop the chart lying, and they are the point:
 *
 * 1. DATE BASIS. A lead that arrives in January and books in March belongs to
 *    January under "what share of January's leads booked" (`basis: 'lead'`)
 *    and to March under "how many bookings started in March"
 *    (`basis: 'booking'`). Different questions; the result says which.
 * 2. MATURITY. The newest buckets have not had time to convert, so plotted raw
 *    the latest period always collapses and reads as a crisis. Any bucket whose
 *    end is newer than the median lead→booking lag is flagged `maturing`. The
 *    lag is measured over EVERY booked lead, not just the windowed ones: a
 *    30-day window would only ever see fast conversions and call every bucket
 *    mature. With no booked leads there is no lag to reason from, and the
 *    result says so (`maturity: 'unknown'`) rather than calling buckets mature.
 *
 * Buckets are calendar periods in the BUSINESS timezone (pass
 * `pack.content.timezone`). Weeks start on Monday. Every period between the
 * first and last is emitted, so an empty week is a visible gap.
 */

export interface TrendLead {
  /** ISO instant the lead arrived. */
  receivedAt: string;
  /** Pipeline status; absent = `new`. A status of `booked` counts as booked. */
  status?: string;
  /** Booking / first-visit date: `YYYY-MM-DD` (a calendar date in the
   *  business timezone) or an ISO instant. */
  bookedAt?: string | null;
  /** Already a client when they used the form: in the booking system, not a
   *  conversion. Leaves both sides of `bookedRate`. */
  existing?: boolean;
  spam?: boolean;
  phoneClicks?: number;
  [dimension: string]: unknown;
}

export type Bucket = 'week' | 'month';
export type DateBasis = 'lead' | 'booking';

export interface TrendPoint {
  key: string;
  label: string;
  leads: number;
  booked: number;
  /** booked / leads over non-existing leads, 0..1. Null when there are none. */
  bookedRate: number | null;
  worked: number;
  stillNew: number;
  phoneTapped: number;
  existing: number;
  spam: number;
  medianDaysToBooking: number | null;
  /** Too recent to have converted yet — show it, but do not read it. */
  maturing: boolean;
}

export interface TrendSeries {
  name: string;
  points: TrendPoint[];
}

export interface TrendResult {
  bucket: Bucket;
  basis: DateBasis;
  timezone: string;
  breakdown: string;
  keys: string[];
  labels: string[];
  series: TrendSeries[];
  /** Median lead→booking lag over every booked lead. */
  medianLagDays: number | null;
  /** `unknown` when no lead has booked yet: maturity cannot be judged, and
   *  `maturing: false` on every point then means "not judged", not "mature". */
  maturity: 'median-lag' | 'unknown';
  /** Leads excluded because they had no usable date for this basis. */
  undated: number;
  totalLeads: number;
}

export interface BuildTrendsOptions {
  basis?: DateBasis;
  bucket?: Bucket;
  /** IANA timezone for calendar buckets. Use `pack.content.timezone`. */
  timezone: string;
  /** Lead field to split series by, or `none`. */
  breakdown?: string;
  /** Days back from `now`; 0 / absent = all time. */
  windowDays?: number;
  includeSpam?: boolean;
  now?: number;
  /** Locale for period labels. Default `en-US`. */
  locale?: string;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar date of a lead/booking date in `tz`. A bare `YYYY-MM-DD` is already
 *  a business-calendar date and is used as-is: parsing it as an instant reads
 *  it as UTC midnight, which in any timezone west of UTC is the PREVIOUS day,
 *  so a booking on the 1st was filed under last month. */
function dateIn(value: string, tz: string): CalendarDate | null {
  const m = DATE_ONLY.exec(value);
  if (m) return { y: +m[1]!, m: +m[2]!, d: +m[3]! };
  return calendarDate(value, tz);
}

function instantOf(value: string, tz: string): number {
  const m = DATE_ONLY.exec(value);
  return m ? zonedMidnight(+m[1]!, +m[2]!, +m[3]!, tz) : Date.parse(value);
}

function weekKey(p: CalendarDate): string {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

export function bucketKeyFor(value: string, bucket: Bucket, timezone: string): string | null {
  const p = dateIn(value, timezone);
  if (!p) return null;
  return bucket === 'week' ? weekKey(p) : `${p.y}-${String(p.m).padStart(2, '0')}`;
}

function labelFor(key: string, bucket: Bucket, locale: string): string {
  if (bucket === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Every bucket key between the first and last, so empty periods are gaps. */
export function fillKeys(keys: string[], bucket: Bucket): string[] {
  if (!keys.length) return [];
  const sorted = [...new Set(keys)].sort();
  const out: string[] = [];
  if (bucket === 'month') {
    const [y0, m0] = sorted[0]!.split('-').map(Number);
    const [y1, m1] = sorted[sorted.length - 1]!.split('-').map(Number);
    for (let y = y0!, m = m0!; y < y1! || (y === y1 && m <= m1!); ) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return out;
  }
  const cur = new Date(`${sorted[0]}T00:00:00Z`);
  const end = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return out;
}

export function daysBetween(a: string | null | undefined, b: string | null | undefined, tz = 'UTC'): number | null {
  if (!a || !b) return null;
  const ta = instantOf(a, tz);
  const tb = instantOf(b, tz);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 864e5);
}

export function median(ns: number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

const isBooked = (l: TrendLead) => l.status === 'booked' || !!l.bookedAt;

function dimOf(l: TrendLead, b: string): string {
  if (b === 'none') return 'all';
  const v = l[b];
  return typeof v === 'string' && v.trim() ? v.trim() : '—';
}

export function buildTrends(leads: TrendLead[], opts: BuildTrendsOptions): TrendResult {
  const tz = opts.timezone;
  const bucket: Bucket = opts.bucket === 'week' ? 'week' : 'month';
  const basis: DateBasis = opts.basis === 'booking' ? 'booking' : 'lead';
  const breakdown = opts.breakdown && opts.breakdown !== 'receivedAt' && opts.breakdown !== 'bookedAt' ? opts.breakdown : 'none';
  const now = opts.now ?? Date.now();
  const locale = opts.locale ?? 'en-US';
  const windowDays = opts.windowDays && opts.windowDays > 0 ? opts.windowDays : 0;

  const usable = leads.filter((l) => opts.includeSpam || !l.spam);

  const allLags = usable
    .map((l) => daysBetween(l.receivedAt, l.bookedAt, tz))
    .filter((d): d is number => d != null && d >= 0);
  const medianLagDays = median(allLags);

  const dateOf = (l: TrendLead) => (basis === 'booking' ? l.bookedAt : l.receivedAt);

  let undated = 0;
  const rows: Array<{ l: TrendLead; key: string; dim: string }> = [];
  for (const l of usable) {
    const v = dateOf(l);
    if (!v) {
      undated++;
      continue;
    }
    if (windowDays) {
      const t = instantOf(v, tz);
      if (!Number.isFinite(t) || now - t > windowDays * 864e5) continue;
    }
    const key = bucketKeyFor(v, bucket, tz);
    if (!key) {
      undated++;
      continue;
    }
    rows.push({ l, key, dim: dimOf(l, breakdown) });
  }

  const keys = fillKeys(rows.map((r) => r.key), bucket);

  // A bucket's end is local midnight after its last day, in the business tz.
  const bucketEnd = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number);
    return bucket === 'month' ? zonedMidnight(y!, m! + 1, 1, tz) : zonedMidnight(y!, m!, d! + 7, tz);
  };
  const lagMs = (medianLagDays ?? 0) * 864e5;
  const isMaturing = (key: string) => medianLagDays != null && now - bucketEnd(key) < lagMs;

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.dim, (counts.get(r.dim) ?? 0) + 1);
  const dims = breakdown === 'none' ? ['all'] : [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);

  const series: TrendSeries[] = dims.map((name) => ({
    name,
    points: keys.map((key) => {
      const ls = rows.filter((r) => r.key === key && (breakdown === 'none' || r.dim === name)).map((r) => r.l);
      const booked = ls.filter(isBooked);
      const counted = ls.filter((l) => !l.existing);
      const countedBooked = booked.filter((l) => !l.existing);
      const lags = booked.map((l) => daysBetween(l.receivedAt, l.bookedAt, tz)).filter((d): d is number => d != null && d >= 0);
      return {
        key,
        label: labelFor(key, bucket, locale),
        leads: ls.length,
        booked: booked.length,
        bookedRate: counted.length ? countedBooked.length / counted.length : null,
        worked: ls.filter((l) => (l.status || 'new') !== 'new').length,
        stillNew: ls.filter((l) => (l.status || 'new') === 'new').length,
        phoneTapped: ls.filter((l) => (l.phoneClicks ?? 0) > 0).length,
        existing: ls.filter((l) => l.existing).length,
        spam: ls.filter((l) => l.spam).length,
        medianDaysToBooking: median(lags),
        maturing: isMaturing(key),
      };
    }),
  }));

  return {
    bucket,
    basis,
    timezone: tz,
    breakdown,
    keys,
    labels: keys.map((k) => labelFor(k, bucket, locale)),
    series,
    medianLagDays,
    maturity: medianLagDays == null ? 'unknown' : 'median-lag',
    undated,
    totalLeads: usable.length,
  };
}
