import { defaultAeoCitationConfig, hostIs, hostOf, type AeoCitationConfig, type CompetitorEntry } from '@jeldon/config';

/**
 * Who an engine cited, in its own order, classified by the decision each kind
 * drives. Ported from BoH commit e09c9a7 ("record who the answer engines cited
 * instead of us", branch claude/moot-5ql5q9, not yet on BoH main):
 *   - `us`         — our host
 *   - `competitor` — a roster host (`who` names it; first roster entry wins,
 *                    so a practice listed before its practitioners is named)
 *   - `directory`  — review / listing sites: the lever is the listing, not an article
 *   - `reddit`     — feeds the listening radar
 *   - `other`      — usually a national authority site: a content question
 * `list` marks URLs that look like a "best of" / numbered-list page, judged
 * from the address alone (the page is never fetched).
 */

export type CitationKind = 'us' | 'competitor' | 'directory' | 'reddit' | 'other';

export interface ClassifiedCitation {
  url: string;
  rank: number;
  host: string;
  kind: CitationKind;
  who?: string;
  list?: true;
}

/** Roster host → display name. Entries with no parseable URL are skipped. */
export function competitorHostsFromRoster(roster: ReadonlyArray<Pick<CompetitorEntry, 'id' | 'name' | 'url'>> = []): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of roster) {
    const h = hostOf(c.url || '');
    if (h && !map.has(h)) map.set(h, c.name || c.id);
  }
  return map;
}

export function classifyCitations(
  urls: ReadonlyArray<string>,
  ourHost: string,
  competitorHosts: Map<string, string>,
  cfg: AeoCitationConfig = defaultAeoCitationConfig,
): ClassifiedCitation[] {
  const listRe = new RegExp(cfg.listUrlPattern, 'i');
  const ours = hostOf(ourHost);
  return (urls ?? []).slice(0, cfg.topN).map((url, i) => {
    const host = hostOf(url);
    let kind: CitationKind = 'other';
    let who: string | undefined;
    if (ours && hostIs(host, ours)) kind = 'us';
    else if (hostIs(host, 'reddit.com', 'redd.it')) kind = 'reddit';
    else {
      const comp = [...competitorHosts.entries()].find(([h]) => hostIs(host, h));
      if (comp) {
        kind = 'competitor';
        who = comp[1];
      } else if (cfg.directoryHosts.length && hostIs(host, ...cfg.directoryHosts)) kind = 'directory';
    }
    let path = '';
    try {
      path = decodeURIComponent(new URL(url).pathname).toLowerCase();
    } catch {
      path = '';
    }
    const list = listRe.test(path);
    return { url, rank: i + 1, host, kind, ...(who ? { who } : {}), ...(list ? { list: true as const } : {}) };
  });
}

/** One link an engine cited in our place, merged across engines. */
export interface CitedInstead {
  url: string;
  host: string;
  kind: Exclude<CitationKind, 'us'>;
  who?: string;
  list?: true;
  /** How many engines cited it for this query. */
  engines: number;
  /** Best (lowest) rank across those engines. */
  bestRank: number;
}

/**
 * What the engines cited instead of us for one query: every non-us link,
 * most engines first, best rank kept. `'not-recorded'` when no engine result
 * carries `citations` (older snapshots), so a brief says "not recorded yet"
 * instead of implying nothing outranked us.
 */
export function citedInstead(
  engines: Record<string, { citations?: ClassifiedCitation[]; error?: string }>,
): CitedInstead[] | 'not-recorded' {
  const withData = Object.values(engines).filter((e) => !e.error && Array.isArray(e.citations));
  if (!withData.length) return 'not-recorded';
  const byUrl = new Map<string, CitedInstead>();
  for (const e of withData) {
    for (const c of e.citations!) {
      if (c.kind === 'us') continue;
      const cur = byUrl.get(c.url);
      if (cur) {
        cur.engines += 1;
        cur.bestRank = Math.min(cur.bestRank, c.rank);
      } else {
        byUrl.set(c.url, {
          url: c.url,
          host: c.host,
          kind: c.kind,
          ...(c.who ? { who: c.who } : {}),
          ...(c.list ? { list: true as const } : {}),
          engines: 1,
          bestRank: c.rank,
        });
      }
    }
  }
  return [...byUrl.values()].sort((a, b) => b.engines - a.engines || a.bestRank - b.bestRank);
}
