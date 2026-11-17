/**
 * Search Analytics fetch + the daily snapshot, ported from Body of Health
 * `scripts/fetch-search-console.mjs` (`queryGsc` + `main`). Network goes
 * through an injected `fetch`; the token comes from `getAccessToken`.
 */
import { SearchConsoleHttpError, type FetchLike } from './auth.js';
import type { MetricRow } from './analysis.js';

export const SEARCH_CONSOLE_API = 'https://searchconsole.googleapis.com/webmasters/v3';

export type SearchDimension = 'query' | 'page' | 'date' | 'country' | 'device' | 'searchAppearance';

export interface DateRange {
  start: string;
  end: string;
}

/** A row exactly as the Search Analytics API returns it. */
export interface SearchAnalyticsRow extends MetricRow {
  keys: string[];
}

export interface SearchConsoleClient {
  accessToken: string;
  fetch?: FetchLike;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The lookback window, ending `lagDays` before `now` (GSC data lags ~2–3 days). */
export function searchDateRange(opts: { rangeDays: number; lagDays: number; now?: Date }): DateRange {
  const end = new Date(opts.now ?? new Date());
  end.setUTCDate(end.getUTCDate() - opts.lagDays);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - opts.rangeDays + 1);
  return { start: ymd(start), end: ymd(end) };
}

/**
 * One Search Analytics query. Throws `SearchConsoleHttpError` (stage `query`)
 * on a non-2xx so the caller can run `diagnoseSearchConsoleError` on it.
 * An empty `rows` from a 200 is returned as `[]` — that is Google's answer for
 * "no data in range", not a failure.
 */
export async function fetchSearchAnalytics(
  client: SearchConsoleClient,
  property: string,
  range: DateRange,
  dims: SearchDimension[],
  opts: { rowLimit?: number; type?: 'web' | 'image' | 'video' | 'news' | 'discover' } = {},
): Promise<SearchAnalyticsRow[]> {
  const f = client.fetch ?? (globalThis.fetch as FetchLike);
  const url = `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const body: Record<string, unknown> = {
    startDate: range.start,
    endDate: range.end,
    type: opts.type ?? 'web',
    rowLimit: opts.rowLimit ?? 500,
  };
  if (dims.length) body.dimensions = dims;
  const res = await f(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${client.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new SearchConsoleHttpError('query', res.status, await res.text());
  const data = (await res.json()) as { rows?: SearchAnalyticsRow[] };
  return data.rows ?? [];
}

/**
 * The properties the authenticated account can see (`GET /sites`). Used by
 * `diagnoseSearchConsoleError` to tell "not a user" from "wrong property
 * string", which return the same 403.
 */
export async function listSites(client: SearchConsoleClient): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const f = client.fetch ?? (globalThis.fetch as FetchLike);
  const res = await f(`${SEARCH_CONSOLE_API}/sites`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${client.accessToken}` },
  });
  if (!res.ok) throw new SearchConsoleHttpError('query', res.status, await res.text());
  const data = (await res.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
  return data.siteEntry ?? [];
}

export interface KeyedRow extends MetricRow {
  query?: string;
  page?: string;
}

/** The on-disk snapshot shape (same as BoH `src/data/search-console.json`). */
export interface SearchConsoleSnapshot {
  lastUpdated: string;
  property: string;
  rangeDays: number;
  dateRange: DateRange;
  totals: MetricRow;
  daily: Array<{ date: string; clicks: number; impressions: number }>;
  queries: KeyedRow[];
  pages: KeyedRow[];
}

function round(n: number, p = 4): number {
  return Math.round((n + Number.EPSILON) * 10 ** p) / 10 ** p;
}

/** Queries, pages, daily and totals for the window, in parallel. */
export async function fetchSnapshot(
  client: SearchConsoleClient,
  property: string,
  opts: { rangeDays: number; lagDays: number; rowLimit: number; now?: Date },
): Promise<SearchConsoleSnapshot> {
  const range = searchDateRange(opts);
  const [queries, pages, daily, totalsRows] = await Promise.all([
    fetchSearchAnalytics(client, property, range, ['query'], { rowLimit: opts.rowLimit }),
    fetchSearchAnalytics(client, property, range, ['page'], { rowLimit: opts.rowLimit }),
    fetchSearchAnalytics(client, property, range, ['date'], { rowLimit: 1000 }),
    fetchSearchAnalytics(client, property, range, [], { rowLimit: 1 }),
  ]);
  const mapRow = (r: SearchAnalyticsRow, key: 'query' | 'page'): KeyedRow => ({
    [key]: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: round(r.ctr),
    position: round(r.position, 1),
  });
  const t = totalsRows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    lastUpdated: (opts.now ?? new Date()).toISOString(),
    property,
    rangeDays: opts.rangeDays,
    dateRange: range,
    totals: { clicks: t.clicks, impressions: t.impressions, ctr: round(t.ctr), position: round(t.position, 1) },
    daily: daily.map((r) => ({ date: r.keys[0] ?? '', clicks: r.clicks, impressions: r.impressions })),
    queries: queries.map((r) => mapRow(r, 'query')),
    pages: pages.map((r) => mapRow(r, 'page')),
  };
}

/** Serialize for disk. */
export function serializeSnapshot(s: SearchConsoleSnapshot): string {
  return JSON.stringify(s, null, 2) + '\n';
}

/** True when `next` differs from `prev` ignoring `lastUpdated`, so the cron
 *  does not churn a commit every run when the numbers are identical. */
export function snapshotChanged(prev: string | null, next: string): boolean {
  if (prev == null) return true;
  const strip = (s: string) => s.replace(/"lastUpdated":\s*"[^"]*"/, '"lastUpdated":""');
  return strip(prev) !== strip(next);
}
