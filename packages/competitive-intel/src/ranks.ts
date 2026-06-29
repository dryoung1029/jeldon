import { readFile, writeFile } from 'node:fs/promises';
import type { CompetitorsConfig } from '@jeldon/config';
import type {
  CompetitorAudit,
  KeywordRank,
  RankKeys,
  RanksFile,
  RanksStore,
} from './types.js';

/**
 * Local-pack rank tracking for priority keywords. For each keyword we query the
 * ACTUAL Google local pack via SerpApi's `google_local` engine, located to the
 * brand's city, and find our position. This matches what a searcher in town
 * sees far better than a self-centered Places Text Search (the fallback, flagged
 * `method: 'places'`, which over-favors us because the search is centered on us).
 *
 * Ported from Body of Health `keyword-ranks.ts`. Roster + our identity + the
 * local-pack location are read from `pack.competitors`; persistence is behind
 * `RanksStore` (was the inline GitHub-Contents read/write). The keyword list is
 * an explicit input — resolving which keywords to track from a content corpus is
 * host I/O (see `aggregatePriorityKeywords` for the pure aggregation half).
 */

const SERPAPI_URL = 'https://serpapi.com/search.json';
const PLACES_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

const normName = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Tolerant business-name match. SerpApi's place_id is often a Google CID, not
 *  the Places `ChIJ...` id we store, so name is the reliable cross-provider
 *  signal. Substring in either direction, length-guarded against trivial hits. */
function nameMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 6 && longer.includes(shorter);
}

// ---------- SerpApi google_local (the real local pack) ----------

interface SerpLocalResult {
  position?: number;
  place_id?: string;
  title?: string;
}

export async function rankOneSerpApi(
  keyword: string,
  location: string,
  ourPlaceId: string,
  ourName: string,
  serpApiKey: string,
  competitorPlaceIds: Record<string, string>,
  competitorNames: Record<string, string>,
): Promise<KeywordRank> {
  const url = `${SERPAPI_URL}?engine=google_local&q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&hl=en&gl=us&api_key=${encodeURIComponent(serpApiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = (await res.json()) as {
    error?: string;
    local_results?: SerpLocalResult[] | { places?: SerpLocalResult[] };
  };
  if (data.error) throw new Error(`SerpApi: ${data.error}`);
  const list: SerpLocalResult[] = Array.isArray(data.local_results)
    ? data.local_results
    : (data.local_results?.places ?? []);

  const ourNorm = normName(ourName);
  const competitorNameList = Object.entries(competitorNames); // [normName, id]
  let rank: number | null = null;
  const top: KeywordRank['topCompetitors'] = [];
  const competitorRanks: Record<string, number | null> = {};
  for (const cid of Object.values(competitorPlaceIds)) competitorRanks[cid] = null;
  for (const cid of Object.values(competitorNames)) if (!(cid in competitorRanks)) competitorRanks[cid] = null;

  for (let i = 0; i < list.length; i++) {
    const r = list[i]!;
    const pos = typeof r.position === 'number' ? r.position : i + 1;
    const pid = r.place_id;
    const nameNorm = normName(r.title);
    const isUs = (!!pid && pid === ourPlaceId) || nameMatches(nameNorm, ourNorm);
    if (isUs && rank === null) rank = pos;
    if (top.length < 5) top.push({ name: r.title ?? '(unnamed)', rank: pos, isUs });
    let cId = pid ? competitorPlaceIds[pid] : undefined;
    if (!cId && nameNorm) {
      const hit = competitorNameList.find(([cn]) => nameMatches(nameNorm, cn));
      cId = hit?.[1];
    }
    if (cId && competitorRanks[cId] == null) competitorRanks[cId] = pos;
  }
  return {
    keyword,
    rank,
    totalReturned: list.length,
    topCompetitors: top,
    competitorRanks,
    sampledAt: new Date().toISOString(),
    method: 'serpapi-local',
  };
}

// ---------- Places Text Search (self-centered fallback) ----------

export async function rankOnePlaces(
  keyword: string,
  center: { latitude: number; longitude: number },
  ourPlaceId: string,
  placesKey: string,
  competitorPlaceIds: Record<string, string>,
): Promise<KeywordRank> {
  const res = await fetch(PLACES_TEXT_URL, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': placesKey,
      'X-Goog-FieldMask': 'places.id,places.displayName',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      textQuery: keyword,
      locationBias: { circle: { center, radius: 16093 } }, // ~10mi
      languageCode: 'en',
      regionCode: 'US',
    }),
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = (await res.json()) as { places?: Array<{ id: string; displayName?: { text: string } }> };
  const places = data.places ?? [];
  let rank: number | null = null;
  const top: KeywordRank['topCompetitors'] = [];
  const competitorRanks: Record<string, number | null> = {};
  for (const cid of Object.values(competitorPlaceIds)) competitorRanks[cid] = null;
  for (let i = 0; i < places.length; i++) {
    const p = places[i]!;
    const isUs = p.id === ourPlaceId;
    if (isUs && rank === null) rank = i + 1;
    if (i < 5) top.push({ name: p.displayName?.text ?? '(unnamed)', rank: i + 1, isUs });
    const competitorId = competitorPlaceIds[p.id];
    if (competitorId && competitorRanks[competitorId] == null) competitorRanks[competitorId] = i + 1;
  }
  return {
    keyword,
    rank,
    totalReturned: places.length,
    topCompetitors: top,
    competitorRanks,
    sampledAt: new Date().toISOString(),
    method: 'places',
  };
}

// ---------- Orchestration ----------

export interface TrackLocalRanksOptions {
  /** Keywords to rank. Resolve from priority keywords at the host (see
   *  `aggregatePriorityKeywords`) or pass an explicit list. */
  keywords: string[];
  competitors: CompetitorsConfig;
  keys: RankKeys;
  store: RanksStore;
  /** Resolved center coords for the Places fallback (best-effort for SerpApi). */
  center?: { latitude: number; longitude: number } | null;
  /** Default local-pack location when `competitors.localPackLocation` is unset. */
  defaultLocation?: string;
  batchSize?: number;
}

export interface TrackLocalRanksResult {
  ok: boolean;
  refreshed: number;
  method: 'serpapi-local' | 'places';
  location?: string;
  errors: string[];
  ranks: Record<string, KeywordRank>;
}

/**
 * Refresh local-pack ranks for a keyword list and persist via the store. Prefers
 * SerpApi's real local pack; falls back to self-centered Places Text Search when
 * only a Places key is present. Mirrors `keyword-ranks.ts::POST`.
 */
export async function trackLocalRanks(opts: TrackLocalRanksOptions): Promise<TrackLocalRanksResult> {
  const { competitors, keys, store } = opts;
  const serpApiKey = keys.serpapi;
  const placesKey = keys.places;
  if (!serpApiKey && !placesKey) {
    throw new Error('Set serpapi (preferred — real local pack) or places API key.');
  }
  const useSerpApi = !!serpApiKey;

  const ourPlaceId = competitors.ourPlaceId;
  if (!ourPlaceId) throw new Error('competitors.ourPlaceId is required for rank tracking.');

  const location =
    (competitors.localPackLocation && competitors.localPackLocation.trim()) ||
    opts.defaultLocation ||
    'United States';
  const ourName = competitors.ourName || 'Us';
  const center = opts.center ?? null;
  if (!useSerpApi && !center) {
    throw new Error('A resolved center coordinate is required for the Places method.');
  }

  const keywords = opts.keywords.map((k) => String(k).trim()).filter(Boolean);
  if (!keywords.length) throw new Error('No keywords to rank.');

  const existing = await store.read();
  const updated: Record<string, KeywordRank> = { ...existing.ranks };
  const errors: string[] = [];

  // Map competitors by placeId AND normalized name.
  const competitorPlaceIds: Record<string, string> = {};
  const competitorNames: Record<string, string> = {};
  for (const c of competitors.roster) {
    if (c.placeId) competitorPlaceIds[c.placeId] = c.id;
    if (c.name) competitorNames[normName(c.name)] = c.id;
  }

  const batchSize = opts.batchSize ?? 5;
  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (kw) => {
        try {
          const rank = useSerpApi
            ? await rankOneSerpApi(kw, location, ourPlaceId, ourName, serpApiKey!, competitorPlaceIds, competitorNames)
            : await rankOnePlaces(kw, center!, ourPlaceId, placesKey!, competitorPlaceIds);
          return [kw, rank] as const;
        } catch (e) {
          errors.push(`${kw}: ${(e as Error).message}`);
          return [kw, null] as const;
        }
      }),
    );
    for (const [kw, rank] of results) if (rank) updated[kw] = rank;
  }

  const out: RanksFile = {
    ranks: updated,
    lastRun: new Date().toISOString(),
    method: useSerpApi ? 'serpapi-local' : 'places',
    ...(useSerpApi ? { location } : {}),
  };
  await store.write(out);

  return {
    ok: true,
    refreshed: keywords.length,
    method: out.method!,
    ...(useSerpApi ? { location } : {}),
    errors,
    ranks: out.ranks,
  };
}

// ---------- Priority-keyword aggregation (pure) ----------

export interface PriorityKeyword {
  phrase: string;
  totalWeight: number;
}

/**
 * Aggregate priority keywords across competitor audits: sum positioning weights
 * (deduped, lowercased), drop terms our own positioning already surfaces, and
 * drop terms a `covered` predicate marks as already-covered by our content.
 * Pure — the host supplies the audits + the coverage check (which is store I/O).
 * Mirrors `keyword-ranks.ts::loadPriorityKeywords` minus the GitHub reads.
 */
export function aggregatePriorityKeywords(opts: {
  competitorAudits: CompetitorAudit[];
  ourPositioningKeywords?: Array<{ phrase: string }>;
  covered?: (phrase: string) => boolean;
  limit?: number;
}): PriorityKeyword[] {
  const agg = new Map<string, PriorityKeyword>();
  for (const a of opts.competitorAudits) {
    const pos = a.positioning;
    if (!pos) continue;
    for (const k of pos.keywords) {
      const phrase = String(k.phrase ?? '').toLowerCase().trim();
      if (!phrase) continue;
      const cur = agg.get(phrase) ?? { phrase, totalWeight: 0 };
      cur.totalWeight += Number(k.weight ?? 0);
      agg.set(phrase, cur);
    }
  }

  const ours = new Set<string>(
    (opts.ourPositioningKeywords ?? [])
      .map((k) => String(k.phrase ?? '').toLowerCase().trim())
      .filter(Boolean),
  );
  const covered = opts.covered ?? (() => false);

  return Array.from(agg.values())
    .filter((k) => !ours.has(k.phrase) && !covered(k.phrase))
    .sort((a, b) => b.totalWeight - a.totalWeight)
    .slice(0, opts.limit ?? 30);
}

// ---------- Stores ----------

const EMPTY_RANKS: RanksFile = { ranks: {}, lastRun: null };

/** JSON-file store (the cron default — `keyword-ranks.json` in BoH). */
export class FsRanksStore implements RanksStore {
  constructor(private readonly path: string) {}
  async read(): Promise<RanksFile> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<RanksFile>;
      return { ranks: parsed.ranks ?? {}, lastRun: parsed.lastRun ?? null, method: parsed.method, location: parsed.location };
    } catch {
      return { ...EMPTY_RANKS };
    }
  }
  async write(data: RanksFile): Promise<void> {
    await writeFile(this.path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
}

/** In-memory store — holds the last write, persists nothing. */
export class NullRanksStore implements RanksStore {
  private data: RanksFile;
  constructor(seed?: RanksFile) {
    this.data = seed ?? { ...EMPTY_RANKS };
  }
  async read(): Promise<RanksFile> {
    return this.data;
  }
  async write(data: RanksFile): Promise<void> {
    this.data = data;
  }
}
