/**
 * Google Places (Place Details) → hours. Network behind an injected `fetch`.
 * Ported from Body of Health `scripts/fetch-hours.mjs`.
 */
import type { DayHours, DayName, HoursData, HoursInterval, SpecialHours } from '@jeldon/config';

export const DAY_NAMES: readonly DayName[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** The Place Details endpoint (a Google API constant, not a domain value). */
export const PLACE_DETAILS_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/details/json';

interface GPoint {
  day?: number;
  time?: string;
  date?: string;
}
interface GPeriod {
  open?: GPoint;
  close?: GPoint;
}
export interface GoogleCurrentOpeningHours {
  periods?: GPeriod[];
  special_days?: Array<{ date?: string }>;
}

/** '0730' → '07:30'. */
function hhmm(s: unknown): string {
  if (typeof s !== 'string') return '';
  const padded = s.padStart(4, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

const interval = (p: GPeriod): HoursInterval => ({
  opens: hhmm(p.open?.time),
  // No close = open 24 h; represented conservatively as until 23:59.
  closes: p.close?.time ? hhmm(p.close.time) : '23:59',
});

/** Google weekly periods → per-day intervals (split shifts kept, sorted).
 *  Days with no period are omitted (= closed). */
export function buildRegularHours(periods: GPeriod[]): DayHours[] {
  const map = new Map<DayName, HoursInterval[]>(DAY_NAMES.map((d) => [d, []]));
  for (const p of periods) {
    if (!p?.open) continue;
    const idx = Number(p.open.day);
    if (!Number.isInteger(idx) || idx < 0 || idx > 6) continue;
    map.get(DAY_NAMES[idx]!)!.push(interval(p));
  }
  return DAY_NAMES.filter((d) => map.get(d)!.length > 0).map((d) => ({
    day: d,
    intervals: map.get(d)!.sort((a, b) => a.opens.localeCompare(b.opens)),
  }));
}

/**
 * Google's `current_opening_hours` covers the next seven days with any
 * Business Profile "special hours" applied, and lists the dates that differ
 * from the weekly schedule in `special_days`. A listed date with no period is
 * a closure; one with periods is a one-off schedule.
 *
 * Returns `null` when Google sent nothing usable, so a missing field never
 * reads as "no closures this week". An empty array means Google answered and
 * there are no special days.
 */
export function googleSpecialDays(current: GoogleCurrentOpeningHours | null | undefined): SpecialHours[] | null {
  if (!current || !Array.isArray(current.periods)) return null;
  const periods = current.periods;
  const dates = (current.special_days ?? [])
    .map((sd) => sd?.date)
    .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  return [...new Set(dates)].sort().map((date) => ({
    date,
    intervals: periods
      .filter((p) => p?.open?.date === date)
      .map(interval)
      .sort((a, b) => a.opens.localeCompare(b.opens)),
    source: 'google' as const,
  }));
}

/**
 * Merge this run's Google special days into the stored list.
 *
 * - Past dates (before `today`, YYYY-MM-DD in the business timezone) are
 *   dropped either way.
 * - `google === null` (fetch failed / field missing): stored entries are kept
 *   untouched apart from the past-date trim. This is NOT the same as `[]`.
 * - Otherwise Google is the source of truth for the week it reports on: every
 *   earlier Google-sourced entry is replaced by this run's set, and a manual
 *   entry (no `source`) is kept unless Google reports the same date.
 */
export function mergeSpecialHours(
  stored: readonly SpecialHours[] | null | undefined,
  google: readonly SpecialHours[] | null,
  today: string,
): SpecialHours[] {
  const future = (stored ?? []).filter((e) => typeof e?.date === 'string' && e.date >= today);
  if (google === null) return [...future];
  const googleDates = new Set(google.map((g) => g.date));
  const manual = future.filter((e) => e.source !== 'google' && !googleDates.has(e.date));
  const fromGoogle = google
    .filter((g) => g.date >= today)
    .map((g) => ({ ...g, source: 'google' as const }));
  return [...manual, ...fromGoogle].sort((a, b) => a.date.localeCompare(b.date));
}

export type PlacesHoursResult =
  | { status: 'ok'; regularHours: DayHours[]; specialDays: SpecialHours[] | null }
  /** Credentials absent: nothing was fetched and nothing should be written. */
  | { status: 'not_configured'; reason: string }
  /** The call failed or returned no usable weekly hours. Do not overwrite. */
  | { status: 'error'; reason: string };

export interface FetchPlaceHoursOptions {
  apiKey: string | undefined;
  placeId: string | undefined;
  fetch?: typeof fetch;
  language?: string;
  endpoint?: string;
}

export async function fetchPlaceHours(opts: FetchPlaceHoursOptions): Promise<PlacesHoursResult> {
  if (!opts.apiKey || !opts.placeId) {
    return { status: 'not_configured', reason: 'Places API key or place ID not set' };
  }
  const doFetch = opts.fetch ?? fetch;
  const url = new URL(opts.endpoint ?? PLACE_DETAILS_ENDPOINT);
  url.searchParams.set('place_id', opts.placeId);
  url.searchParams.set('fields', 'opening_hours,current_opening_hours,utc_offset');
  url.searchParams.set('language', opts.language ?? 'en');
  url.searchParams.set('key', opts.apiKey);

  let data: {
    status?: string;
    error_message?: string;
    result?: { opening_hours?: { periods?: GPeriod[] }; current_opening_hours?: GoogleCurrentOpeningHours };
  };
  try {
    const res = await doFetch(url.toString());
    if (!res.ok) return { status: 'error', reason: `HTTP ${res.status}` };
    data = (await res.json()) as typeof data;
  } catch (err) {
    return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
  if (data.status !== 'OK') {
    return { status: 'error', reason: `Places returned ${data.status ?? '(no status)'}: ${data.error_message ?? '(no message)'}` };
  }
  const periods = data.result?.opening_hours?.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    return { status: 'error', reason: 'no opening_hours.periods returned; refusing to overwrite with empty hours' };
  }
  return {
    status: 'ok',
    regularHours: buildRegularHours(periods),
    specialDays: googleSpecialDays(data.result?.current_opening_hours),
  };
}

function sameRegular(a: readonly DayHours[] | undefined, b: readonly DayHours[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((d, i) => {
    const e = b[i]!;
    const ai: HoursInterval[] = d.intervals ?? [];
    const bi: HoursInterval[] = e.intervals ?? [];
    return d.day === e.day && ai.length === bi.length && ai.every((iv, j) => iv.opens === bi[j]!.opens && iv.closes === bi[j]!.closes);
  });
}

/**
 * The next data file after a successful Places call. Two timestamps, because
 * they answer different questions: `fetchedAt` moves only when the hours
 * changed; `checkedAt` moves on every successful call, so a freshness check
 * can tell "hours haven't changed since June" from "the refresh is silently
 * skipping".
 */
export function refreshHoursData(
  existing: HoursData | null,
  fetched: Extract<PlacesHoursResult, { status: 'ok' }>,
  opts: { today: string; now?: Date; source?: string },
): { data: HoursData; unchanged: boolean } {
  const nowIso = (opts.now ?? new Date()).toISOString();
  const specialHours = mergeSpecialHours(existing?.specialHours, fetched.specialDays, opts.today);
  const unchanged =
    !!existing &&
    sameRegular(existing.regularHours, fetched.regularHours) &&
    JSON.stringify(existing.specialHours ?? []) === JSON.stringify(specialHours);
  return {
    unchanged,
    data: {
      fetchedAt: unchanged ? existing!.fetchedAt : nowIso,
      checkedAt: nowIso,
      source: opts.source ?? 'google-places',
      regularHours: fetched.regularHours,
      specialHours,
    },
  };
}
