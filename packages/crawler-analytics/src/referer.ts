import { defaultAnalyticsConfig, hostIs, hostOf, type DomainPack, type AnalyticsConfig, type RefererChannelRule } from '@jeldon/config';

/**
 * Referer / source → acquisition-channel classifier. ONE function, ONE injected
 * map — this kills the 3-file triplication the Decoupling Notes call out:
 *   - `fetch-cf-analytics.mjs::classifyReferer` (host → channel, drops own domain)
 *   - `traffic-sources.ts::classifySource` (UTM-source OR host → channel)
 *   - the per-article editor CTA logic (same map, third copy)
 *
 * `raw` may be a referer host, a full URL, or a UTM source token.
 *   1. Exact UTM tokens (`utmSources`) are checked first, across all rules.
 *   2. Otherwise the hostname is extracted and rules are tried in order:
 *      `hosts` (exact or parent domain), `hostPatterns` (anchored regex),
 *      `hostContains` (substring, last resort). First match wins.
 * A host on `ownHosts` is internal navigation and returns `null`, as does a
 * `drop:true` rule. An empty/absent value returns `directLabel`. A host
 * matching no rule falls back to its bare hostname.
 *
 * Matching is anchored to the hostname on purpose. BoH matched substrings, so
 * `t.co` matched every host ending in `t.com` (reddit, chatgpt, pinterest) and
 * a site with no X presence reported X as its #1 referrer (2026-09-06).
 */
export function classifyReferer(
  raw: string | null | undefined,
  map: RefererChannelRule[] = defaultAnalyticsConfig.refererChannelMap,
  directLabel: string = defaultAnalyticsConfig.directLabel,
  ownHosts: string[] = defaultAnalyticsConfig.ownHosts ?? [],
): string | null {
  const s = (raw || '').toLowerCase().trim();
  if (!s || s === 'direct') return directLabel;

  for (const rule of map) {
    if (rule.utmSources?.some((t) => t.toLowerCase() === s)) {
      return rule.drop ? null : (rule.label ?? s);
    }
  }

  const host = hostOf(s);
  if (!host) return bareHost(raw!) || directLabel;
  if (ownHosts.length && hostIs(host, ...ownHosts)) return null;

  for (const rule of map) {
    if (matchesHost(rule, host)) return rule.drop ? null : (rule.label ?? host);
  }
  return host;
}

function matchesHost(rule: RefererChannelRule, host: string): boolean {
  if (rule.hosts?.length && hostIs(host, ...rule.hosts)) return true;
  if (rule.hostPatterns?.some((p) => new RegExp(p, 'i').test(host))) return true;
  if (rule.hostContains?.some((c) => host.includes(c.toLowerCase()))) return true;
  return false;
}

/** Strip scheme + path, leaving the bare host (the BoH fallback). */
function bareHost(raw: string): string {
  return raw.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
}

/**
 * The analytics config for a pack: `pack.analytics` (or the defaults) with the
 * host of `brand.siteUrl` added to `ownHosts`, so own-domain navigation is
 * dropped without a brand literal in the referer map.
 */
export function analyticsConfigFromPack(
  pack: Pick<DomainPack, 'brand'> & { analytics?: AnalyticsConfig },
): AnalyticsConfig {
  const cfg = pack.analytics ?? defaultAnalyticsConfig;
  const own = new Set(cfg.ownHosts ?? []);
  const siteHost = hostOf(pack.brand.siteUrl);
  if (siteHost) own.add(siteHost);
  return { ...cfg, ownHosts: [...own] };
}

/**
 * Aggregate a list of `{ source, count }` raw rows into a sorted channel
 * breakdown, dropping suppressed sources. Mirrors the reducer in
 * `fetch-cf-analytics.mjs::fetchReferrers`.
 */
export function aggregateReferrers(
  rows: Array<{ host: string; count: number }>,
  map: RefererChannelRule[] = defaultAnalyticsConfig.refererChannelMap,
  directLabel: string = defaultAnalyticsConfig.directLabel,
  limit = 15,
  ownHosts: string[] = defaultAnalyticsConfig.ownHosts ?? [],
): Array<{ source: string; requests: number }> {
  const agg = new Map<string, number>();
  for (const r of rows) {
    const label = classifyReferer(r.host, map, directLabel, ownHosts);
    if (label === null) continue;
    agg.set(label, (agg.get(label) ?? 0) + (r.count || 0));
  }
  return [...agg.entries()]
    .map(([source, requests]) => ({ source, requests }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, limit);
}
