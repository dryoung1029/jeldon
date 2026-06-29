import { defaultAnalyticsConfig, type RefererChannelRule } from '@jeldon/config';

/**
 * Referer / source → acquisition-channel classifier. ONE function, ONE injected
 * map — this kills the 3-file triplication the Decoupling Notes call out:
 *   - `fetch-cf-analytics.mjs::classifyReferer` (host → channel, drops own domain)
 *   - `traffic-sources.ts::classifySource` (UTM-source OR host → channel)
 *   - the per-article editor CTA logic (same map, third copy)
 *
 * Rules are evaluated in order; the first rule with any matching needle wins. A
 * `drop:true` rule returns `null` (the source is suppressed — internal nav, the
 * CF Access auth redirect). An empty/absent host returns `directLabel`. A host
 * matching no rule falls back to its bare hostname.
 *
 * `raw` may be a referer host, a UTM source token, or a full URL — it's
 * lowercased and matched as a substring, so all three forms work against the
 * same map (that's why the three BoH copies could merge into one).
 */
export function classifyReferer(
  raw: string | null | undefined,
  map: RefererChannelRule[] = defaultAnalyticsConfig.refererChannelMap,
  directLabel: string = defaultAnalyticsConfig.directLabel,
): string | null {
  const s = (raw || '').toLowerCase().trim();
  if (!s || s === 'direct') return directLabel;

  for (const rule of map) {
    if (rule.needles.some((n) => s.includes(n.toLowerCase()))) {
      return rule.drop ? null : (rule.label ?? bareHost(raw!));
    }
  }
  return bareHost(raw!) || directLabel;
}

/** Strip scheme + path, leaving the bare host (the BoH fallback). */
function bareHost(raw: string): string {
  return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
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
): Array<{ source: string; requests: number }> {
  const agg = new Map<string, number>();
  for (const r of rows) {
    const label = classifyReferer(r.host, map, directLabel);
    if (label === null) continue;
    agg.set(label, (agg.get(label) ?? 0) + (r.count || 0));
  }
  return [...agg.entries()]
    .map(([source, requests]) => ({ source, requests }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, limit);
}
