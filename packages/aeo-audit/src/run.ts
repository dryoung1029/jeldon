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
  const needle = brand.url.toLowerCase();
  let citationRank: number | null = null;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (u && needle && u.toLowerCase().includes(needle)) {
      citationRank = i + 1;
      break;
    }
  }
  const lowerText = (responseText || '').toLowerCase();
  const brandMentioned = brand.mentions.some((m) => m && lowerText.includes(m.toLowerCase()));
  return {
    cited: citationRank !== null,
    citationRank,
    totalCitations,
    brandMentioned,
  };
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

/** PT (America/Los_Angeles) date key — the snapshot's canonical date. Override
 *  the timezone via `opts.timezone` (e.g. `pack.content.timezone`). */
export function dateKey(d: Date = new Date(), timezone = 'America/Los_Angeles'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Run all engines (parallel) against one query and parse citations. */
async function runQuery(query: AeoQuery, engines: Engine[], brand: BrandMatch): Promise<QueryResult> {
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
        result.engines[eng.name] = {
          ...parsed,
          // Don't store the full response text — hash it for change detection.
          responseHash: await sha256(raw.text ?? ''),
          urlsCount: urls.length,
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
    results.push(await runQuery(q, engines, opts.brand));
  }
  return {
    date: dateKey(opts.now, opts.timezone),
    engines: engines.map((e) => e.name),
    queryCount: querySet.length,
    results,
  };
}
