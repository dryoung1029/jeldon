import { defaultAnalyticsConfig, type AnalyticsConfig } from '@jeldon/config';
import { detectAiCrawler, looksLikeBot } from './crawlers.js';
import { aggregateReferrers } from './referer.js';

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
}

export interface ReferrerSummary {
  referrers: Array<{ source: string; requests: number }>;
  referrersDays: number;
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
 * Web Vitals introspection (`fetch-cf-analytics.mjs::fetchWebVitals`) is a
 * separate self-discovering query that returns a free-form `metrics` blob; it's
 * deliberately left out of the typed provider surface for now.
 * TODO(port): add `fetchWebVitals()` mirroring fetch-cf-analytics.mjs:127-192
 * once the metric shape is stable enough to type.
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
    this.fetchImpl = opts.fetchImpl ?? fetch;
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
        );
        return { referrers, referrersDays: days };
      } catch {
        // try the narrower window
      }
    }
    return { referrers: [], referrersDays: 0 };
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

  for (const r of rows) {
    const path = r.path || '/';
    const ua = r.ua || '';
    const status = Number(r.status);
    const n = r.count || 0;

    if (!assetRe.test(path)) pathCounts[path] = (pathCounts[path] || 0) + n;
    if (status === 404) path404[path] = (path404[path] || 0) + n;

    const am = articleRe.exec(path);
    if (am && (status === 200 || status === 304)) {
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

  return { day, topPaths, top404Paths, crawlerSnapshot: { date: day, totalHits, bots }, articleHits };
}
