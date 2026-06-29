/**
 * Per-article traffic reader. Ported from `src/lib/admin/article-analytics.ts`.
 *
 * BoH imported `../../data/article-traffic.json` directly — a hard coupling to a
 * repo file. Here the store is PASSED IN (the rolling daily shape written by the
 * provider's `fetchDayDetail` → host writeback), so the engine never reaches a
 * specific file. The host reads its JSON however it likes and hands the parsed
 * object to these pure functions.
 *
 * The human/bot split is a UA heuristic (no paid bot-management on the free
 * plan), so it's directional — surface it as an estimate.
 */

export interface ArticleTrafficDay {
  date: string;
  hits: Record<string, { human: number; bot: number }>;
}

export interface ArticleTrafficStore {
  lastUpdated: string | null;
  days: ArticleTrafficDay[];
}

export interface ArticleTraffic {
  slug: string;
  human: number;
  bot: number;
  total: number;
  /** 0–1 share of total that's human. */
  humanShare: number;
}

export const emptyArticleTrafficStore: ArticleTrafficStore = { lastUpdated: null, days: [] };

/** Has any traffic data landed yet? (False until the first cron run after deploy.) */
export function hasTrafficData(store: ArticleTrafficStore): boolean {
  return Array.isArray(store.days) && store.days.length > 0;
}

export function trafficLastUpdated(store: ArticleTrafficStore): string | null {
  return store.lastUpdated;
}

/** The number of days actually covered by the store, capped at `windowDays`. */
export function trafficWindowCovered(store: ArticleTrafficStore, windowDays = 30): number {
  return Math.min(store.days.length, windowDays);
}

/** Summed per-slug traffic over the last `windowDays` days, newest-first slice. */
export function getArticleTraffic(store: ArticleTrafficStore, windowDays = 30): Map<string, ArticleTraffic> {
  const days = store.days.slice(-windowDays);
  const acc = new Map<string, { human: number; bot: number }>();
  for (const day of days) {
    for (const [slug, h] of Object.entries(day.hits || {})) {
      const cur = acc.get(slug) ?? { human: 0, bot: 0 };
      cur.human += h.human || 0;
      cur.bot += h.bot || 0;
      acc.set(slug, cur);
    }
  }
  const out = new Map<string, ArticleTraffic>();
  for (const [slug, { human, bot }] of acc) {
    const total = human + bot;
    out.set(slug, { slug, human, bot, total, humanShare: total ? human / total : 0 });
  }
  return out;
}

/** Traffic for a single article over the window (zeros if none recorded). */
export function getArticleTrafficFor(
  store: ArticleTrafficStore,
  slug: string,
  windowDays = 30,
): ArticleTraffic {
  return (
    getArticleTraffic(store, windowDays).get(slug) ?? {
      slug,
      human: 0,
      bot: 0,
      total: 0,
      humanShare: 0,
    }
  );
}

/**
 * Upsert a day's article hits into the rolling store (replacing same-date), sort
 * ascending, and cap at `maxDays`. Mirrors the writeback in
 * `fetch-cf-analytics.mjs::main` (the article-traffic store section). Returns a
 * new store object; the host serializes it.
 */
export function upsertArticleTrafficDay(
  store: ArticleTrafficStore,
  day: string,
  hits: Record<string, { human: number; bot: number }>,
  maxDays = 365,
  now = new Date(),
): ArticleTrafficStore {
  const days = (store.days || []).filter((d) => d.date !== day);
  days.push({ date: day, hits });
  days.sort((a, b) => a.date.localeCompare(b.date));
  return {
    lastUpdated: now.toISOString(),
    days: days.length > maxDays ? days.slice(-maxDays) : days,
  };
}
