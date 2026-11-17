import { defaultAnalyticsConfig, type AnalyticsConfig } from '@jeldon/config';

/**
 * The one key for a site route. Ported from BoH, where two copies
 * (`fetch-cf-analytics.mjs` and `page-traffic.ts`) had to stay in lockstep
 * because the conversion map joins edge traffic to lead landing pages by this
 * exact string. One function here, used by the per-route traffic writer and
 * the path-keyed engagement beacon.
 *
 * Lowercased, query/hash dropped, `//` collapsed, trailing slash added.
 * `null` for an empty value (no page is never the homepage: a lead with no
 * landing page must not be credited to "/"), excluded prefixes, file paths
 * (`/sitemap.xml`) and over-long paths.
 */
export function normalizeSitePath(
  path: string | null | undefined,
  cfg: Pick<AnalyticsConfig, 'sitePath'> = defaultAnalyticsConfig,
): string | null {
  if (!path || !String(path).trim()) return null;
  const sp = cfg.sitePath ?? defaultAnalyticsConfig.sitePath!;
  let p = String(path)
    .replace(/^https?:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]!
    .toLowerCase()
    .replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) p = `/${p}`;
  const first = p.split('/')[1] ?? '';
  if (sp.excludePrefixes.some((x) => x.toLowerCase() === first)) return null;
  if (/\.[a-z0-9]{2,5}$/.test(p)) return null;
  if (p.length > sp.maxLength) return null;
  if (!p.endsWith('/')) p += '/';
  return p;
}
