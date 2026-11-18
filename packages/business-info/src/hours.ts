/**
 * Open-now, isomorphic. Runs in the visitor's browser against the business
 * timezone (`pack.content.timezone`) so the chip is right whatever zone the
 * visitor is in and needs no rebuild as the day moves on. A date-specific
 * entry wins over the weekly schedule (empty intervals = closed that date).
 */
import type { BusinessHoursConfig, DayHours, DayName, HoursData, HoursInterval, SpecialHours } from '@jeldon/config';
import { DAY_NAMES } from './places.js';

export interface ZonedNow {
  /** YYYY-MM-DD in the zone. */
  date: string;
  /** 0 = Sunday. */
  dayIdx: number;
  /** Minutes since local midnight. */
  minutes: number;
}

export function zonedNow(timeZone: string, now: Date = new Date()): ZonedNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  const h = Number(p.hour) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dayIdx: DAY_NAMES.indexOf(p.weekday as DayName),
    minutes: h * 60 + Number(p.minute),
  };
}

/** YYYY-MM-DD in `timeZone`. */
export function zonedDate(timeZone: string, now: Date = new Date()): string {
  return zonedNow(timeZone, now).date;
}

const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};

function addDaysIso(iso: string, d: number): string {
  const t = new Date(`${iso}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

/** The minimal shape the helper reads; `HoursData` satisfies it. */
export type HoursLike = Pick<HoursData, 'regularHours'> & { specialHours?: SpecialHours[] };

/** A pack's `brand.hours` as a data file (seed before the first refresh). */
export function hoursFromPack(cfg: BusinessHoursConfig): HoursData {
  return { fetchedAt: null, checkedAt: null, source: 'pack', regularHours: cfg.regular, specialHours: cfg.special ?? [] };
}

export interface NextOpening {
  /** 0 = later today, 1 = tomorrow, … */
  daysAhead: number;
  date: string;
  day: DayName;
  opens: string;
}

export type OpenStatus =
  | { state: 'open'; closes: string }
  | { state: 'closed'; next: NextOpening | null }
  /** No hours to judge by, or the zone could not be read. Not "closed". */
  | { state: 'unknown'; reason: string };

/** Look ahead this many days for the next opening. */
const LOOKAHEAD_DAYS = 14;

export function isOpenNow(hours: HoursLike | null | undefined, now: Date, timeZone: string): OpenStatus {
  const regular: DayHours[] = Array.isArray(hours?.regularHours) ? hours!.regularHours : [];
  const special: SpecialHours[] = Array.isArray(hours?.specialHours) ? hours!.specialHours! : [];
  const anyInterval = regular.some((d) => d.intervals?.length) || special.some((s) => s.intervals?.length);
  if (!anyInterval) return { state: 'unknown', reason: 'no opening hours configured' };

  let z: ZonedNow;
  try {
    z = zonedNow(timeZone, now);
  } catch {
    return { state: 'unknown', reason: `unknown timezone ${timeZone}` };
  }
  if (z.dayIdx < 0) return { state: 'unknown', reason: 'could not read the weekday' };

  const byDay = new Map<string, HoursInterval[]>(regular.map((d) => [d.day, d.intervals ?? []]));
  const byDate = new Map<string, HoursInterval[]>(special.map((s) => [s.date, s.intervals ?? []]));
  const hoursFor = (d: number): { date: string; day: DayName; ivs: HoursInterval[] } => {
    const date = addDaysIso(z.date, d);
    const day = DAY_NAMES[(z.dayIdx + d) % 7]!;
    const ivs = byDate.has(date) ? byDate.get(date)! : byDay.get(day) ?? [];
    return { date, day, ivs: [...ivs].filter((iv) => iv?.opens && iv?.closes).sort((a, b) => a.opens.localeCompare(b.opens)) };
  };

  const today = hoursFor(0);
  for (const iv of today.ivs) {
    if (z.minutes >= toMins(iv.opens) && z.minutes < toMins(iv.closes)) return { state: 'open', closes: iv.closes };
    if (z.minutes < toMins(iv.opens)) {
      return { state: 'closed', next: { daysAhead: 0, date: today.date, day: today.day, opens: iv.opens } };
    }
  }
  for (let d = 1; d <= LOOKAHEAD_DAYS; d++) {
    const h = hoursFor(d);
    if (h.ivs.length) return { state: 'closed', next: { daysAhead: d, date: h.date, day: h.day, opens: h.ivs[0]!.opens } };
  }
  return { state: 'closed', next: null };
}

/** '07:00' → '7 am', '13:30' → '1:30 pm'. */
export function formatTime12(hhmm: string): string {
  const mins = toMins(hhmm);
  if (!Number.isFinite(mins)) return hhmm;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'pm' : 'am'}`;
}

export interface OpenStatusLabels {
  openUntil: (time: string) => string;
  opensToday: (time: string) => string;
  opensTomorrow: (time: string) => string;
  opensOn: (day: DayName, time: string, date: string, daysAhead: number) => string;
}

export const defaultOpenStatusLabels: OpenStatusLabels = {
  openUntil: (t) => `Open now · until ${t}`,
  opensToday: (t) => `Opens today at ${t}`,
  opensTomorrow: (t) => `Closed · opens tomorrow at ${t}`,
  opensOn: (day, t, date, d) => `Closed · opens ${d < 7 ? day : `${day} ${date.slice(5).replace('-', '/')}`} at ${t}`,
};

/** Chip text, or null when there is nothing true to say (keep the fallback). */
export function describeOpenStatus(s: OpenStatus, labels: OpenStatusLabels = defaultOpenStatusLabels): string | null {
  if (s.state === 'open') return labels.openUntil(formatTime12(s.closes));
  if (s.state === 'closed' && s.next) {
    const t = formatTime12(s.next.opens);
    if (s.next.daysAhead === 0) return labels.opensToday(t);
    if (s.next.daysAhead === 1) return labels.opensTomorrow(t);
    return labels.opensOn(s.next.day, t, s.next.date, s.next.daysAhead);
  }
  return null;
}
