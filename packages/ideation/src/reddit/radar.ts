/**
 * Reddit radar — one listening run producing a merged snapshot.
 *
 * Port of Body of Health `scripts/fetch-reddit-radar.mjs`. Four stages:
 *   geo     — new posts in local subs, classified brand > competitor > service
 *   brand   — sitewide search for each brand term
 *   condition — weekly top QUESTIONS in topic subs (readers' literal wording)
 *   evergreen — all-time-top threads per (sub, money query), with searchRank
 *
 * Matching is word-bounded (`mentionsTerm`), with generic-phrase exclusions
 * per brand term: BoH tagged a news story as a BRAND mention because a brand
 * name was also an ordinary English phrase. Competitor names come from
 * `competitors.roster`, so the roster stays the single source of truth.
 *
 * Persistence is the host's job: pass the previous snapshot in, write the
 * returned one out. A run where every request failed returns `all_failed`
 * and the previous snapshot unchanged — it is never clobbered.
 */

import { defaultRedditListeningConfig, mentionsTerm, type RedditListeningConfig } from '@jeldon/config';
import type { IdeationPack } from '../types.js';
import { RedditReader, redditSources, type RedditPost } from './fetch.js';

export type RadarKind = 'brand' | 'competitor' | 'evergreen' | 'local-opportunity' | 'condition';

/** Precedence when a post matches several buckets (lower wins). */
export const KIND_RANK: Record<RadarKind, number> = {
  brand: 0,
  competitor: 1,
  evergreen: 2,
  'local-opportunity': 3,
  condition: 4,
};

export interface RadarItem {
  id: string;
  kind: RadarKind;
  subreddit: string;
  title: string;
  permalink: string;
  author: string;
  createdUtc: string | null;
  /** Null when only the RSS path answered (never 0). */
  score: number | null;
  numComments: number | null;
  matched: string[];
  firstSeen?: string;
  /** Position in the sub's all-time-top search results for a money query. */
  searchRank?: number;
  searchKey?: string;
}

export interface RadarSnapshot {
  lastRun: string | null;
  warnings: string[];
  items: RadarItem[];
}

export type RadarRunResult =
  | { status: 'not_configured'; reason: string }
  | { status: 'all_failed'; warnings: string[]; snapshot: RadarSnapshot | null }
  | { status: 'ok'; snapshot: RadarSnapshot; matchedThisRun: number; counts: Partial<Record<RadarKind, number>> };

export function redditConfig(pack: IdeationPack): RedditListeningConfig | null {
  const r = pack.listening?.reddit;
  return r ? { ...defaultRedditListeningConfig, ...r } : null;
}

/** Brand-term exclusions: listening's own, else the AEO audit's (same failure). */
export function brandExclusions(pack: IdeationPack, cfg: RedditListeningConfig): Record<string, string[]> {
  const src = cfg.genericPhraseExclusions ?? pack.aeo?.brandMentionExclusions ?? {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(src)) out[k.trim().toLowerCase()] = v;
  return out;
}

/** Terms from `terms` that `text` mentions, word-bounded, minus generic phrasings. */
export function matchTerms(text: string, terms: string[], exclusions: Record<string, string[]> = {}): string[] {
  return terms.filter((t) => mentionsTerm(text, t, exclusions[t.trim().toLowerCase()] ?? []));
}

/** Competitor names from the roster, skipping names too short to match safely. */
export function competitorNames(pack: IdeationPack, minLength: number): string[] {
  return (pack.competitors?.roster ?? []).map((c) => c.name).filter((n) => typeof n === 'string' && n.length >= minLength);
}

const QUESTION_RE = /^(why|what|how|should|is|are|can|could|do|does|did|will|would|when|where|who|anyone|has)\b/i;

export function isQuestionTitle(title: string): boolean {
  return title.includes('?') || QUESTION_RE.test(title);
}

/** Rotate by a per-day offset so the same tail entries aren't starved every run. */
export function rotateByDay<T>(arr: T[], nowMs: number): T[] {
  if (!arr.length) return arr;
  const r = Math.floor(nowMs / 86_400_000) % arr.length;
  return arr.slice(r).concat(arr.slice(0, r));
}

function toItem(post: RedditPost, kind: RadarKind, matched: string[]): RadarItem {
  const permalink = post.permalink?.startsWith('http') ? post.permalink : `https://www.reddit.com${post.permalink ?? ''}`;
  return {
    id: post.id,
    kind,
    subreddit: post.subreddit ?? '',
    title: String(post.title ?? '').slice(0, 300),
    permalink,
    author: post.author ?? '',
    createdUtc: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
    score: post.score ?? null,
    numComments: post.num_comments ?? null,
    matched,
  };
}

export interface RadarDeps {
  fetchImpl: typeof fetch;
  /** Last snapshot, for firstSeen / kind / count carry-over. */
  previous?: RadarSnapshot | null;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export async function runRedditRadar(pack: IdeationPack, deps: RadarDeps): Promise<RadarRunResult> {
  const cfg = redditConfig(pack);
  if (!cfg) return { status: 'not_configured', reason: 'listening.reddit is not configured.' };
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const startedAt = now();
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const reader = new RedditReader({
    fetchImpl: deps.fetchImpl,
    userAgent: cfg.userAgent.replace('{siteUrl}', pack.brand.siteUrl),
    rssRetryMs: cfg.rssRetryMs,
    maxRssRetries: cfg.maxRssRetries,
    retryDeadline: startedAt + cfg.retryBudgetMs,
    sleep,
    now,
    warn,
  });
  const exclusions = brandExclusions(pack, cfg);
  const rivals = competitorNames(pack, cfg.competitorMinNameLength);

  const found = new Map<string, RadarItem>();
  const add = (item: RadarItem) => {
    if (!item.id) return;
    const existing = found.get(item.id);
    if (!existing) {
      found.set(item.id, item);
      return;
    }
    const winner = KIND_RANK[item.kind] < KIND_RANK[existing.kind] ? item : existing;
    const loser = winner === item ? existing : item;
    // A brand mention inside an all-time-top thread needs both facts.
    if (loser.searchRank != null && winner.searchRank == null) {
      winner.searchRank = loser.searchRank;
      winner.searchKey = loser.searchKey;
    }
    found.set(item.id, winner);
  };
  let anySuccess = false;
  const pull = async (src: ReturnType<typeof redditSources.subNew>) => {
    const posts = await reader.fetchPosts(src);
    await sleep(cfg.requestDelayMs);
    if (posts) anySuccess = true;
    return posts;
  };
  const textOf = (p: RedditPost) => `${p.title ?? ''} ${p.selftext ?? ''}`;

  const geoStage = async () => {
    for (const sub of rotateByDay(cfg.geoSubreddits, startedAt)) {
      const posts = await pull(redditSources.subNew(sub));
      for (const p of posts ?? []) {
        const text = textOf(p);
        const brand = matchTerms(text, cfg.brandTerms, exclusions);
        if (brand.length) {
          add(toItem(p, 'brand', brand));
          continue;
        }
        const rival = matchTerms(text, rivals);
        if (rival.length) {
          add(toItem(p, 'competitor', rival));
          continue;
        }
        const svc = matchTerms(text, cfg.serviceKeywords);
        if (svc.length) add(toItem(p, 'local-opportunity', svc));
      }
    }
  };
  const brandStage = async () => {
    for (const term of rotateByDay(cfg.brandTerms, startedAt)) {
      const posts = await pull(redditSources.sitewideSearch(term));
      for (const p of posts ?? []) {
        if (matchTerms(textOf(p), [term], exclusions).length) add(toItem(p, 'brand', [term]));
      }
    }
  };
  const conditionStage = async () => {
    for (const sub of rotateByDay(cfg.conditionSubreddits, startedAt)) {
      const posts = await pull(redditSources.subTopWeek(sub));
      for (const p of posts ?? []) if (isQuestionTitle(String(p.title ?? ''))) add(toItem(p, 'condition', []));
    }
  };
  const evergreenStage = async () => {
    for (const t of rotateByDay(cfg.targetSearches, startedAt)) {
      const posts = await pull(redditSources.subSearchAllTime(t.sub, t.query));
      (posts ?? []).forEach((p, idx) => {
        const item = toItem(p, 'evergreen', [t.query]);
        item.searchRank = idx + 1;
        item.searchKey = `r/${t.sub} · "${t.query}"`;
        const text = textOf(p);
        const brand = matchTerms(text, cfg.brandTerms, exclusions);
        const rival = brand.length ? [] : matchTerms(text, rivals);
        if (brand.length) {
          item.kind = 'brand';
          item.matched = brand;
        } else if (rival.length) {
          item.kind = 'competitor';
          item.matched = rival;
        }
        add(item);
      });
    }
  };

  for (const stage of rotateByDay([geoStage, brandStage, conditionStage, evergreenStage], startedAt)) await stage();

  if (!anySuccess) {
    warn('every Reddit request failed (runner IP likely blocked); the previous snapshot is kept untouched');
    return { status: 'all_failed', warnings, snapshot: deps.previous ?? null };
  }

  const nowIso = new Date(now()).toISOString();
  const prevById = new Map((deps.previous?.items ?? []).map((i) => [i.id, i]));
  const merged = new Map(prevById);
  for (const [id, item] of found) {
    const existing = prevById.get(id);
    // A stronger kind learned earlier survives a weaker match today.
    const prevStronger = !!existing && KIND_RANK[existing.kind] < KIND_RANK[item.kind];
    merged.set(id, {
      ...item,
      kind: prevStronger ? existing!.kind : item.kind,
      matched: prevStronger && existing!.matched?.length ? existing!.matched : item.matched,
      searchRank: item.searchRank ?? existing?.searchRank,
      searchKey: item.searchKey ?? existing?.searchKey,
      // Never downgrade a number to null on an RSS-only day.
      score: item.score ?? existing?.score ?? null,
      numComments: item.numComments ?? existing?.numComments ?? null,
      firstSeen: existing?.firstSeen ?? nowIso,
    });
  }

  // Retention applies to fresh-listening kinds only; evergreen threads are old by definition.
  const cutoff = now() - cfg.retentionDays * 86_400_000;
  let items = [...merged.values()]
    .filter((i) => i.kind === 'evergreen' || i.searchRank != null || !i.createdUtc || Date.parse(i.createdUtc) >= cutoff)
    .sort((a, b) => (b.createdUtc ?? '').localeCompare(a.createdUtc ?? ''));
  if (items.length > cfg.maxItems) items = items.slice(0, cfg.maxItems);

  const counts: Partial<Record<RadarKind, number>> = {};
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  return { status: 'ok', snapshot: { lastRun: nowIso, warnings, items }, matchedThisRun: found.size, counts };
}
