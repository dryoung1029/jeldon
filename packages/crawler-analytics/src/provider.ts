import { defaultAnalyticsConfig, type AnalyticsConfig } from '@jeldon/config';
import { detectAiCrawler, looksLikeBot } from './crawlers.js';
import { aggregateReferrers } from './referer.js';
import { normalizeSitePath } from './site-path.js';

// ── Result shapes ──────────────────────────────────────────────────────────
// These match the JSON the BoH Command Center already reads
// (src/data/cf-analytics.json, ai-crawler-snapshots.json, article-traffic.json)
// so the host panels revive with no changes.

export interface DailyTrafficRow {
  date: string;
  requests: number;
  pageViews: number;
  uniques: number;
  bytes: number;
  cachedRequests: number;
  threats: number;
}

export interface TrafficSummary {
  daily: DailyTrafficRow[];
  geo: Array<{ country: string; requests: number }>;
  statuses: Array<{ status: number; requests: number }>;
}

export interface BotSnapshot {
  bot: string;
  engine: string;
  purpose: 'train' | 'index' | 'live';
  count: number;
  statuses: Record<string, number>;
  paths: Record<string, number>;
}

export interface CrawlerSnapshot {
  date: string;
  totalHits: number;
  bots: BotSnapshot[];
}

export interface DayDetail {
  day: string;
  topPaths: Array<{ path: string; requests: number }>;
  top404Paths: Array<{ path: string; requests: number }>;
  crawlerSnapshot: CrawlerSnapshot;
  /** slug → { human, bot } successful article loads on `day`. */
  articleHits: Record<string, { human: number; bot: number }>;
  /** normalized site path → { human, bot } successful route loads on `day`
   *  (every page, not just articles). Keyed by `normalizeSitePath`. */
  pageHits: Record<string, { human: number; bot: number }>;
}

export interface ReferrerSummary {
  referrers: Array<{ source: string; requests: number }>;
  referrersDays: number;
}

export type WebVitalKey = 'LCP' | 'INP' | 'FID' | 'CLS' | 'FCP' | 'TTFB';

/**
 * Core Web Vitals from Cloudflare Web Analytics (RUM). `ok` carries metrics;
 * `no-rows` means the query worked but nothing was recorded in the window
 * (usually RUM is not enabled on the zone); `unattestable` means we could not
 * measure at all, with the reason and what the schema actually exposes, so
 * the next run can be fixed from the log alone. Never an empty "ok".
 */
export type WebVitalsResult =
  | {
      status: 'ok';
      days: number;
      sampleSize: number;
      container: 'quantiles' | 'avg';
      metrics: Partial<Record<WebVitalKey, { value: number; pct: number | null }>>;
    }
  | { status: 'no-rows'; days: number; container: 'quantiles' | 'avg'; hint: string }
  | {
      status: 'unattestable';
      reason: 'no-account' | 'type-not-found' | 'no-container' | 'no-metric-fields' | 'query-failed';
      detail: string;
      /** RUM-looking type names the schema exposes (type-not-found). */
      rumTypesPresent?: string[];
      /** Container → subfield names discovered (no-container / no-metric-fields). */
      schema?: Record<string, string[]>;
    };

/** Map a CF RUM field name to a vital + percentile. Exported for testing. */
export function mapVitalField(name: string): { key: WebVitalKey; pct: number | null } | null {
  const f = name.toLowerCase();
  const pm = /p(\d{2})$/.exec(f);
  const pct = pm ? Number(pm[1]) : null;
  let key: WebVitalKey | null = null;
  if (f.includes('largestcontentfulpaint')) key = 'LCP';
  else if (f.includes('interactiontonextpaint')) key = 'INP';
  else if (f.includes('firstinputdelay')) key = 'FID';
  else if (f.includes('cumulativelayoutshift')) key = 'CLS';
  else if (f.includes('firstcontentfulpaint')) key = 'FCP';
  else if (f.includes('timetofirstbyte') || f.includes('ttfb')) key = 'TTFB';
  return key ? { key, pct } : null;
}

/**
 * The provider contract. Cloudflare's GraphQL Analytics API is ONE adapter;
 * the engine reaches edge analytics only through this interface, never through
 * `fetch-cf-analytics.mjs` directly (the Decoupling Notes "Cloudflare analytics"
 * row). A null adapter is the default so the engine runs with no provider wired.
 *
 * Each method returns the already-classified/aggregated result so the host just
 * writes JSON — the AI-bot list, referer map, asset/article regexes are all
 * injected from `pack.analytics`, not embedded in the adapter.
 */
export interface AnalyticsProvider {
  /** Multi-day traffic / geo / response-status (BoH `httpRequests1dGroups`). */
  fetchTraffic(): Promise<TrafficSummary>;
  /** One-day path × UA detail → top pages, top 404s, AI-crawler snapshot,
   *  per-article human/bot hits (BoH `httpRequestsAdaptiveGroups`). */
  fetchDayDetail(): Promise<DayDetail>;
  /** Acquisition-source breakdown (BoH account-scoped RUM referers). */
  fetchReferrers(): Promise<ReferrerSummary>;
}

// ── Null default ─────────────────────────────────────────────────────────

/** Returns empty results. The default when no analytics provider is configured
 *  (`services.analytics === 'none'`). Never throws. */
export class NullAnalytics implements AnalyticsProvider {
  async fetchTraffic(): Promise<TrafficSummary> {
    return { daily: [], geo: [], statuses: [] };
  }
  async fetchDayDetail(): Promise<DayDetail> {
    return {
      day: new Date().toISOString().slice(0, 10),
      topPaths: [],
      top404Paths: [],
      crawlerSnapshot: { date: new Date().toISOString().slice(0, 10), totalHits: 0, bots: [] },
      articleHits: {},
      pageHits: {},
    };
  }
  async fetchReferrers(): Promise<ReferrerSummary> {
    return { referrers: [], referrersDays: 0 };
  }
}

// ── Cloudflare adapter ─────────────────────────────────────────────────────

export interface CloudflareAnalyticsOpts {
  /** API token: Account Analytics:Read + Zone Analytics:Read. From env in BoH. */
  token: string;
  /** Falls back to `cfg.cloudflare.zoneId`. */
  zoneId?: string;
  /** Falls back to `cfg.cloudflare.accountId`. Referers need this (RUM is
   *  account-scoped); without it `fetchReferrers` returns empty. */
  accountId?: string;
  /** Falls back to `cfg.cloudflare.endpoint`. */
  endpoint?: string;
  /** Injected for testability; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

function dateDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Cloudflare GraphQL Analytics adapter. Ported faithfully from
 * `scripts/fetch-cf-analytics.mjs` — the same three queries
 * (`httpRequests1dGroups`, `httpRequestsAdaptiveGroups`,
 * `rumPageloadEventsAdaptiveGroups`) and the same aggregation, but with every
 * domain literal (zone/account id, bot list, referer map, asset/article regexes,
 * window sizes) read from `AnalyticsConfig` instead of hardcoded.
 *
 * `fetchWebVitals()` is a separate self-discovering query (CF metric field
 * names differ across schemas); it is Cloudflare-specific, so it lives on this
 * adapter rather than the provider interface.
 */
export class CloudflareAnalytics implements AnalyticsProvider {
  private readonly token: string;
  private readonly zoneId?: string;
  private readonly accountId?: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cfg: AnalyticsConfig;

  constructor(opts: CloudflareAnalyticsOpts, cfg: AnalyticsConfig = defaultAnalyticsConfig) {
    this.token = opts.token;
    this.cfg = cfg;
    this.zoneId = opts.zoneId ?? cfg.cloudflare?.zoneId;
    this.accountId = opts.accountId ?? cfg.cloudflare?.accountId;
    this.endpoint =
      opts.endpoint ?? cfg.cloudflare?.endpoint ?? 'https://api.cloudflare.com/client/v4/graphql';
    // Never call fetch as a method: Workers throw "Illegal invocation" when
    // fetch runs with a `this` other than globalThis (e.g. this.fetchImpl(...)).
    const fetchFn = opts.fetchImpl ?? fetch;
    this.fetchImpl = (input, init) => fetchFn(input, init);
  }

  private async gql<T = any>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!json) throw new Error(`CF GraphQL non-JSON (HTTP ${res.status})`);
    if (json.errors?.length) {
      throw new Error('CF GraphQL errors: ' + json.errors.map((e: any) => e.message).join('; '));
    }
    return json.data as T;
  }

  async fetchTraffic(): Promise<TrafficSummary> {
    if (!this.zoneId) return { daily: [], geo: [], statuses: [] };
    const windowDays = this.cfg.windowDays;
    const since = dateDaysAgo(windowDays);
    const until = dateDaysAgo(0);
    const data = await this.gql(
      `query($zt:String!,$s:String!,$u:String!){
        viewer { zones(filter:{zoneTag:$zt}){
          httpRequests1dGroups(limit:${windowDays + 1}, filter:{date_geq:$s, date_leq:$u}, orderBy:[date_ASC]){
            dimensions{ date }
            sum{
              requests pageViews bytes cachedRequests threats
              countryMap{ clientCountryName requests }
              responseStatusMap{ edgeResponseStatus requests }
            }
            uniq{ uniques }
          }
        }}
      }`,
      { zt: this.zoneId, s: since, u: until },
    );
    const groups = data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
    const daily: DailyTrafficRow[] = [];
    const geo: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    for (const g of groups) {
      daily.push({
        date: g.dimensions.date,
        requests: g.sum.requests || 0,
        pageViews: g.sum.pageViews || 0,
        uniques: g.uniq?.uniques || 0,
        bytes: g.sum.bytes || 0,
        cachedRequests: g.sum.cachedRequests || 0,
        threats: g.sum.threats || 0,
      });
      for (const c of g.sum.countryMap || []) {
        geo[c.clientCountryName] = (geo[c.clientCountryName] || 0) + c.requests;
      }
      for (const s of g.sum.responseStatusMap || []) {
        statuses[s.edgeResponseStatus] = (statuses[s.edgeResponseStatus] || 0) + s.requests;
      }
    }
    return {
      daily,
      geo: Object.entries(geo)
        .map(([country, requests]) => ({ country, requests }))
        .sort((a, b) => b.requests - a.requests),
      statuses: Object.entries(statuses)
        .map(([status, requests]) => ({ status: Number(status), requests }))
        .sort((a, b) => b.requests - a.requests),
    };
  }

  async fetchDayDetail(): Promise<DayDetail> {
    const empty: DayDetail = {
      day: dateDaysAgo(1),
      topPaths: [],
      top404Paths: [],
      crawlerSnapshot: { date: dateDaysAgo(1), totalHits: 0, bots: [] },
      articleHits: {},
      pageHits: {},
    };
    if (!this.zoneId) return empty;
    const day = dateDaysAgo(1);
    const data = await this.gql(
      `query($zt:String!,$s:Time!,$u:Time!){
        viewer { zones(filter:{zoneTag:$zt}){
          httpRequestsAdaptiveGroups(limit:5000, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]){
            count
            dimensions{ clientRequestPath userAgent edgeResponseStatus }
          }
        }}
      }`,
      { zt: this.zoneId, s: `${day}T00:00:00Z`, u: `${day}T23:59:59Z` },
    );
    const rows = data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
    return aggregateDayDetail(
      rows.map((r: any) => ({
        path: r.dimensions.clientRequestPath || '/',
        ua: r.dimensions.userAgent || '',
        status: r.dimensions.edgeResponseStatus,
        count: r.count || 0,
      })),
      day,
      this.cfg,
    );
  }

  async fetchReferrers(): Promise<ReferrerSummary> {
    if (!this.accountId) return { referrers: [], referrersDays: 0 };
    // RUM allows a wider window than the request dataset; try a week, fall back
    // to a day if the range is rejected. Non-fatal either way.
    for (const days of [7, 1]) {
      try {
        const data = await this.gql(
          `query($at:String!,$s:Time!,$u:Time!){
            viewer { accounts(filter:{accountTag:$at}){
              rumPageloadEventsAdaptiveGroups(limit:1000, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]){
                count
                dimensions{ refererHost }
              }
            }}
          }`,
          { at: this.accountId, s: `${dateDaysAgo(days)}T00:00:00Z`, u: `${dateDaysAgo(0)}T23:59:59Z` },
        );
        const rows = data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];
        const referrers = aggregateReferrers(
          rows.map((r: any) => ({ host: r.dimensions.refererHost, count: r.count || 0 })),
          this.cfg.refererChannelMap,
          this.cfg.directLabel,
          15,
          this.cfg.ownHosts ?? [],
        );
        return { referrers, referrersDays: days };
      } catch {
        // try the narrower window
      }
    }
    return { referrers: [], referrersDays: 0 };
  }

  /**
   * Core Web Vitals over the last `webVitals.days`. Ported from
   * `fetch-cf-analytics.mjs::fetchWebVitals`: introspect the dataset, query the
   * numeric fields that exist (quantiles preferred, p75 preferred), map them
   * to LCP/INP/CLS/FCP/TTFB. When the guessed type is missing, it lists the
   * RUM types the schema does expose.
   */
  async fetchWebVitals(): Promise<WebVitalsResult> {
    const wv = this.cfg.webVitals ?? defaultAnalyticsConfig.webVitals!;
    if (!this.accountId) {
      return { status: 'unattestable', reason: 'no-account', detail: 'No Cloudflare account id configured; Web Analytics is account-scoped.' };
    }
    try {
      const intro = await this.gql<any>(
        `query { t: __type(name:"${wv.typeName}"){ fields { name type { name kind fields { name } ofType { name kind fields { name } } } } } }`,
        {},
      );
      const type = intro?.t;
      if (!type) {
        const names = await this.gql<any>(`query { __schema { types { name } } }`, {}).catch(() => null);
        const rum: string[] = (names?.__schema?.types ?? []).map((t: any) => String(t.name)).filter((n: string) => /rum/i.test(n));
        return {
          status: 'unattestable',
          reason: 'type-not-found',
          detail: rum.length
            ? `Type ${wv.typeName} not found. Set analytics.webVitals.typeName to one of the RUM types present.`
            : `Type ${wv.typeName} not found and the schema exposes no RUM types; the token may lack Account Analytics:Read.`,
          rumTypesPresent: rum,
        };
      }
      const schema: Record<string, string[]> = {};
      for (const fld of type.fields ?? []) {
        const sub = fld.type?.fields ?? fld.type?.ofType?.fields;
        if (sub?.length) schema[fld.name] = sub.map((x: any) => String(x.name));
      }
      const container = schema.quantiles ? 'quantiles' : schema.avg ? 'avg' : null;
      if (!container) {
        return { status: 'unattestable', reason: 'no-container', detail: `${wv.typeName} has no quantiles or avg container.`, schema };
      }
      const fields = (schema[container] ?? []).filter((n) => mapVitalField(n));
      if (!fields.length) {
        return { status: 'unattestable', reason: 'no-metric-fields', detail: `No recognizable Web Vitals fields in ${container}.`, schema };
      }
      const data = await this.gql<any>(
        `query($at:String!,$s:Time!,$u:Time!){
          viewer { accounts(filter:{accountTag:$at}){
            ${wv.dataset}(limit:1, filter:{datetime_geq:$s, datetime_leq:$u}){
              count
              ${container} { ${fields.join(' ')} }
            }
          }}
        }`,
        { at: this.accountId, s: `${dateDaysAgo(wv.days)}T00:00:00Z`, u: `${dateDaysAgo(0)}T23:59:59Z` },
      );
      const row = data?.viewer?.accounts?.[0]?.[wv.dataset]?.[0];
      if (!row) {
        return {
          status: 'no-rows',
          days: wv.days,
          container,
          hint: `Query succeeded but returned no rows in the last ${wv.days} days. Is Web Analytics (RUM) enabled on the zone?`,
        };
      }
      const metrics: Partial<Record<WebVitalKey, { value: number; pct: number | null }>> = {};
      for (const fname of fields) {
        const m = mapVitalField(fname)!;
        const val = row[container]?.[fname];
        if (val == null) continue;
        const prev = metrics[m.key];
        if (!prev || (m.pct === 75 && prev.pct !== 75)) metrics[m.key] = { value: Number(val), pct: m.pct };
      }
      return { status: 'ok', days: wv.days, sampleSize: row.count || 0, container, metrics };
    } catch (e) {
      return { status: 'unattestable', reason: 'query-failed', detail: (e as Error).message };
    }
  }
}

// ── Pure aggregation (exported for direct use + testing) ────────────────────

export interface RawHitRow {
  path: string;
  ua: string;
  status: number | string;
  count: number;
}

/**
 * The one-day reducer from `fetch-cf-analytics.mjs::fetchYesterdayDetail`,
 * lifted verbatim into a pure function: classify each (path, UA, status, count)
 * row into top pages, top 404s, the AI-crawler snapshot, and per-article
 * human/bot hits. Every literal (asset regex, article regex, site-route-404
 * families, AI bot list) comes from `cfg`.
 */
export function aggregateDayDetail(
  rows: RawHitRow[],
  day: string,
  cfg: AnalyticsConfig = defaultAnalyticsConfig,
): DayDetail {
  const assetRe = new RegExp(cfg.assetPathPattern, 'i');
  const articleRe = new RegExp(cfg.articlePathPattern, 'i');

  const pathCounts: Record<string, number> = {};
  const path404: Record<string, number> = {};
  const byBot: Record<string, BotSnapshot> = {};
  const articleHits: Record<string, { human: number; bot: number }> = {};
  const pageHits: Record<string, { human: number; bot: number }> = {};

  for (const r of rows) {
    const path = r.path || '/';
    const ua = r.ua || '';
    const status = Number(r.status);
    const n = r.count || 0;

    if (!assetRe.test(path)) pathCounts[path] = (pathCounts[path] || 0) + n;
    if (status === 404) path404[path] = (path404[path] || 0) + n;

    const ok = status === 200 || status === 304;
    const sitePath = ok && !assetRe.test(path) ? normalizeSitePath(path, cfg) : null;
    if (sitePath) {
      const h = (pageHits[sitePath] ??= { human: 0, bot: 0 });
      if (looksLikeBot(ua, cfg.aiBotList, cfg.botUaPattern)) h.bot += n;
      else h.human += n;
    }

    const am = articleRe.exec(path);
    if (am && ok) {
      const slug = (am[1] ?? '').toLowerCase();
      if (slug) {
        const a = (articleHits[slug] ??= { human: 0, bot: 0 });
        if (looksLikeBot(ua, cfg.aiBotList, cfg.botUaPattern)) a.bot += n;
        else a.human += n;
      }
    }

    const ai = detectAiCrawler(ua, cfg.aiBotList);
    if (ai) {
      const b = (byBot[ai.bot] ??= {
        bot: ai.bot,
        engine: ai.engine,
        purpose: ai.purpose,
        count: 0,
        statuses: {},
        paths: {},
      });
      b.count += n;
      b.statuses[String(status)] = (b.statuses[String(status)] || 0) + n;
      if (!assetRe.test(path)) b.paths[path] = (b.paths[path] || 0) + n;
    }
  }

  const topPaths = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([path, requests]) => ({ path, requests }));

  // Trim each bot's paths to top 30 (matches the old rollup contract).
  for (const b of Object.values(byBot)) {
    b.paths = Object.fromEntries(
      Object.entries(b.paths)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30),
    );
  }
  const bots = Object.values(byBot).sort((a, b) => b.count - a.count);
  const totalHits = bots.reduce((a, b) => a + b.count, 0);

  // Real-content 404s must survive truncation: a scanner-heavy day can fill the
  // top 25 with noise and bury a genuine site-route 404 below the cut. Keep the
  // top 25 by volume PLUS any site-route 404 found beyond it.
  const siteRouteRes = cfg.siteRoute404Patterns?.map((p) => new RegExp(p, 'i')) ?? [];
  const isSiteRoute404 = (p: string) => siteRouteRes.some((re) => re.test(p));
  const sorted404 = Object.entries(path404).sort((a, b) => b[1] - a[1]);
  const top25 = sorted404.slice(0, 25);
  const seen404 = new Set(top25.map(([p]) => p));
  const siteRouteExtra = sorted404
    .slice(25)
    .filter(([p]) => isSiteRoute404(p) && !seen404.has(p))
    .slice(0, 25);
  const top404Paths = [...top25, ...siteRouteExtra].map(([path, requests]) => ({ path, requests }));

  return { day, topPaths, top404Paths, crawlerSnapshot: { date: day, totalHits, bots }, articleHits, pageHits };
}
