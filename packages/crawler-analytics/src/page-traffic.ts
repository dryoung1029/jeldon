import { upsertArticleTrafficDay, type ArticleTrafficStore } from './article-traffic.js';

/**
 * Per-route traffic: every successful site-route load, human/bot split, keyed
 * by `normalizeSitePath`. Ported from BoH `page-traffic.json` + its reader.
 * This is the denominator for conversion reporting, so it covers every page,
 * not just articles. Same rolling daily shape as article traffic.
 */
export type PageTrafficStore = ArticleTrafficStore;

export const emptyPageTrafficStore: PageTrafficStore = { lastUpdated: null, days: [] };

/** Write (or replace) one day of per-route hits, keeping at most `maxDays`. */
export function upsertPageTrafficDay(
  store: PageTrafficStore,
  day: string,
  hits: Record<string, { human: number; bot: number }>,
  maxDays = 365,
  now = new Date(),
): PageTrafficStore {
  return upsertArticleTrafficDay(store, day, hits, maxDays, now);
}

/** Summed per-path human/bot hits over the last `windowDays` days (0 = all). */
export function getPageTraffic(store: PageTrafficStore, windowDays = 30): Map<string, { human: number; bot: number }> {
  const days = windowDays ? store.days.slice(-windowDays) : store.days;
  const acc = new Map<string, { human: number; bot: number }>();
  for (const day of days) {
    for (const [path, h] of Object.entries(day.hits || {})) {
      const cur = acc.get(path) ?? { human: 0, bot: 0 };
      cur.human += h.human || 0;
      cur.bot += h.bot || 0;
      acc.set(path, cur);
    }
  }
  return acc;
}

/** Days this store covers, so a reader can fall back to article traffic for days it doesn't. */
export function pageTrafficDates(store: PageTrafficStore): Set<string> {
  return new Set(store.days.map((d) => d.date));
}
