import { defaultAeoCitationConfig, hostIs, hostOf, mentionsTerm, type AeoCitationConfig } from '@jeldon/config';
import { classifyCitations } from './citations.js';
import type {
  AeoQuery,
  BrandMatch,
  Engine,
  EngineResult,
  QueryResult,
  Snapshot,
} from './types.js';

/**
 * Citation parser — ported verbatim from `scripts/aeo-audit.mjs::parseCitations`,
 * with the brand URL + mention list lifted from BoH literals into the injected
 * `BrandMatch` contract (sourced from `pack.brand.siteUrl` + `pack.aeo.brandMentions`).
 *
 * `citationRank` is the 1-indexed position of the first brand URL in the
 * citations list; null if not cited. `brandMentioned` ignores URL matches and
 * looks for prose mentions of the brand/practitioner.
 */
export function parseCitations(
  urls: string[],
  responseText: string,
  brand: BrandMatch,
): Pick<EngineResult, 'cited' | 'citationRank' | 'totalCitations' | 'brandMentioned'> {
  const totalCitations = urls.length;
  const ours = hostOf(brand.url);
  let citationRank: number | null = null;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    // Hostname match, not substring: `acme.com` must not match `notacme.com`
    // or `acme.com.evil.net`.
    if (u && ours && hostIs(hostOf(u), ours)) {
      citationRank = i + 1;
      break;
    }
  }
  // Whole-term match: "dr young" must not match "Dr. Younger".
  const text = responseText || '';
  const brandMentioned = brand.mentions.some(
    (m) => !!m && mentionsTerm(text, m, brand.mentionExclusions?.[m] ?? brand.mentionExclusions?.[m.toLowerCase()] ?? []),
  );
  return {
    cited: citationRank !== null,
    citationRank,
    totalCitations,
    brandMentioned,
  };
}

/**
 * The cited links on `domain` (exact or subdomain), with their 1-based rank.
 * Reddit is the most-cited external domain in AI answers; a thread an engine
 * already reads for one of our queries is a high-leverage listening target.
 */
export function citationsOnHost(urls: string[], domain: string): Array<{ url: string; rank: number }> {
  return urls
    .map((url, i) => ({ url, rank: i + 1 }))
    .filter((c) => !!c.url && hostIs(hostOf(c.url), domain));
}

/** Truncated SHA-256 of the response text, for change detection without storing
 *  the full body. Uses Web Crypto (global in Node 20+ and the edge runtime). */
async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/** The snapshot's canonical date key in `timezone`. Pass `pack.content.timezone`;
 *  defaults to UTC (the engine assumes no locale). */
export function dateKey(d: Date = new Date(), timezone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Run all engines (parallel) against one query and parse citations. */
async function runQuery(query: AeoQuery, engines: Engine[], opts: RunAuditOptions): Promise<QueryResult> {
  const brand = opts.brand;
  const result: QueryResult = { queryId: query.id, engines: {} };
  await Promise.all(
    engines.map(async (eng) => {
      try {
        const raw = await eng.fn(query.query);
        if (raw.error) {
          result.engines[eng.name] = { error: raw.error };
          return;
        }
        const urls = raw.urls ?? [];
        const parsed = parseCitations(urls, raw.text ?? '', brand);
        const redditCitations = citationsOnHost(urls, 'reddit.com');
        result.engines[eng.name] = {
          ...parsed,
          // Don't store the full response text — hash it for change detection.
          responseHash: await sha256(raw.text ?? ''),
          urlsCount: urls.length,
          ...(redditCitations.length ? { redditCitations } : {}),
          citations: classifyCitations(urls, brand.url, opts.competitorHosts ?? new Map(), opts.citations ?? defaultAeoCitationConfig),
          // Distinguishes "AIO present but didn't cite us" (cited:false,
          // noAiOverview:false) from "no AIO surfaced at all".
          ...(raw.noAiOverview ? { noAiOverview: true } : {}),
        };
      } catch (err) {
        result.engines[eng.name] = { error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  return result;
}

export interface RunAuditOptions {
  brand: BrandMatch;
  /** Competitor host → name, from `competitorHostsFromRoster(pack.competitors.roster)`.
   *  Missing = no competitor tagging, not a failed audit. */
  competitorHosts?: Map<string, string>;
  /** Citation classification. Default `pack.aeo.citations ?? defaultAeoCitationConfig`. */
  citations?: AeoCitationConfig;
  timezone?: string;
  /** Hook for progress logging; defaults to a no-op. */
  onProgress?: (queryId: string) => void;
  now?: Date;
}

/**
 * Run the full query set against the active engines and produce one snapshot.
 * Serial across queries (rate limits + politeness), parallel across engines per
 * query — matching `scripts/aeo-audit.mjs::main`. Pure of any persistence; the
 * caller hands the result to `upsertSnapshot` + a `SnapshotStore`.
 */
export async function runAudit(
  querySet: ReadonlyArray<AeoQuery>,
  engines: Engine[],
  opts: RunAuditOptions,
): Promise<Snapshot> {
  const results: QueryResult[] = [];
  for (const q of querySet) {
    opts.onProgress?.(q.id);
    results.push(await runQuery(q, engines, opts));
  }
  return {
    date: dateKey(opts.now, opts.timezone),
    engines: engines.map((e) => e.name),
    queryCount: querySet.length,
    results,
  };
}
