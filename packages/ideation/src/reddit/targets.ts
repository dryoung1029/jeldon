/**
 * Reddit target scoring — "where is a disclosed, personally written reply
 * worth the next 15 minutes, and where is it too late to reply?"
 *
 * Port of Body of Health `src/pages/api/admin/command/reddit.ts`. Signals,
 * strongest first: an AI engine already cites the thread for a tracked query
 * (from the AEO snapshot's per-engine `redditCitations`), all-time-top search
 * position, brand/competitor mention, then recency and activity.
 *
 * Old threads are not discarded. Past `archivedAfterDays` a thread likely
 * cannot take a reply, so its action becomes "out-publish it": publish the
 * page that deserves the citation. That is the only lever on a locked thread.
 * Nothing here posts; actions are advice for a person.
 */

import type { Snapshot } from '@jeldon/aeo-audit';
import type { IdeationPack } from '../types.js';
import { redditConfig, type RadarItem, type RadarSnapshot } from './radar.js';

export interface CitedBy {
  engine: string;
  queryId: string;
  query: string;
  rank: number;
}

export interface CitedThread {
  /** Stable key (`thread:<id>` when the URL carries one). */
  key: string;
  threadId: string | null;
  url: string;
  citedBy: CitedBy[];
}

export type TargetAction = 'answer-cited' | 'out-publish' | 'read-brand' | 'read-competitor' | 'answer-evergreen' | 'own-next-thread' | 'answer-local' | 'topic-source';

export interface RedditTarget {
  id: string;
  title: string;
  permalink: string;
  subreddit: string;
  createdUtc: string | null;
  numComments: number | null;
  ageDays: number | null;
  targetScore: number;
  reasons: string[];
  action: TargetAction;
  actionText: string;
  /** Reddit archives many subs at ~6 months; an archived thread takes no replies. */
  likelyArchived: boolean;
  engineCitations: number;
}

/** Reddit thread id from a permalink (`/comments/<id>/`), lowercased. */
export function redditThreadId(url: string): string | null {
  try {
    return new URL(url).pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Engines cite the same thread under URL variants; aggregate on the thread id. */
export function threadKey(url: string): string {
  const id = redditThreadId(url);
  if (id) return `thread:${id}`;
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^(www|old|np|new)\./, '')}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url;
  }
}

/** Reddit threads the engines cited in one AEO snapshot, most-cited first. */
export function citedThreadsFromSnapshot(aeo: Snapshot | null | undefined, pack: IdeationPack): CitedThread[] {
  if (!aeo) return [];
  const queryText = new Map((pack.aeo?.querySet ?? []).map((q) => [q.id, q.query]));
  const byKey = new Map<string, CitedThread>();
  for (const result of aeo.results ?? []) {
    for (const [engine, data] of Object.entries(result.engines ?? {})) {
      for (const c of data?.redditCitations ?? []) {
        const key = threadKey(c.url);
        const entry = byKey.get(key) ?? { key, threadId: redditThreadId(c.url), url: c.url, citedBy: [] };
        entry.citedBy.push({ engine, queryId: result.queryId, query: queryText.get(result.queryId) ?? result.queryId, rank: c.rank });
        byKey.set(key, entry);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.citedBy.length - a.citedBy.length);
}

export function ageInDays(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (nowMs - t) / 86_400_000;
}

const ACTION_TEXT: Record<TargetAction, string> = {
  'answer-cited': 'Answer here first: engines already read this thread.',
  'out-publish': 'Engines cite it but you likely cannot reply. Out-publish it: publish the page that deserves the citation.',
  'read-brand': 'Someone named the brand. Read it today; respond only if a response helps.',
  'read-competitor': 'Read for intel. Reply only if you can add neutral value.',
  'answer-evergreen': 'Add the definitive, disclosed answer.',
  'own-next-thread': 'Likely archived. Own the next thread when this question recurs, and mine it for a topic.',
  'answer-local': 'Answer personally, disclose, educate. No pitch.',
  'topic-source': "Feed the topic engine: this is readers' literal query language.",
};

export interface ScoreTargetsResult {
  status: 'ok' | 'not_configured';
  targets: RedditTarget[];
  citedThreads: CitedThread[];
  /** Date of the AEO snapshot used; null = no engine-citation signal available. */
  aeoSnapshotDate: string | null;
}

export function scoreRedditTargets(
  radar: RadarSnapshot | null,
  aeo: Snapshot | null | undefined,
  pack: IdeationPack,
  opts: { now?: number } = {},
): ScoreTargetsResult {
  const cfg = redditConfig(pack);
  const cited = citedThreadsFromSnapshot(aeo, pack);
  if (!cfg) return { status: 'not_configured', targets: [], citedThreads: cited, aeoSnapshotDate: aeo?.date ?? null };
  const now = opts.now ?? Date.now();
  const citeCount = new Map<string, number>();
  for (const c of cited) if (c.threadId) citeCount.set(c.threadId, c.citedBy.length);
  const bands = [...cfg.recency].sort((a, b) => a.maxDays - b.maxDays);

  const targets = (radar?.items ?? []).map((i: RadarItem): RedditTarget => {
    const reasons: string[] = [];
    let score = 0;
    const cites = citeCount.get(i.id.toLowerCase()) ?? 0;
    if (cites > 0) {
      score += 100 + 10 * cites;
      reasons.push(`AI engines cite this thread for ${cites} tracked quer${cites === 1 ? 'y' : 'ies'}`);
    }
    if (i.kind === 'brand') {
      score += 80;
      reasons.push(`brand mention (${i.matched.join(', ')})`);
    }
    if (i.kind === 'competitor') {
      score += 45;
      reasons.push(`competitor mention (${i.matched.join(', ')})`);
    }
    if (i.searchRank != null) {
      score += 40 + Math.max(0, 16 - i.searchRank);
      reasons.push(`#${i.searchRank} all-time result for ${i.searchKey}`);
    }
    if (i.kind === 'local-opportunity') {
      score += 30;
      reasons.push(`local thread matching ${i.matched.slice(0, 3).join(', ')}`);
    }
    if (i.kind === 'condition') {
      score += 8;
      reasons.push('topic-sub question (ideation material)');
    }
    const age = ageInDays(i.createdUtc, now);
    if (age != null) {
      const band = bands.find((b) => age <= b.maxDays);
      if (band && age <= cfg.staleAfterDays) {
        score += band.bonus;
        reasons.push(band.label);
      } else if (age > cfg.staleAfterDays) {
        score -= cfg.stalePenalty;
        reasons.push(`${Math.round(age / 365)}+ year(s) old: reply value is low, treat as a topic source`);
      }
    }
    if (i.numComments != null) score += Math.min(i.numComments, 15);
    const likelyArchived = age != null && age > cfg.archivedAfterDays;
    const tooOld = age != null && age > cfg.staleAfterDays;
    const action: TargetAction =
      cites > 0
        ? likelyArchived || tooOld
          ? 'out-publish'
          : 'answer-cited'
        : i.kind === 'brand'
          ? 'read-brand'
          : i.kind === 'competitor'
            ? 'read-competitor'
            : i.searchRank != null
              ? likelyArchived || tooOld
                ? 'own-next-thread'
                : 'answer-evergreen'
              : i.kind === 'local-opportunity'
                ? 'answer-local'
                : 'topic-source';
    return {
      id: i.id,
      title: i.title,
      permalink: i.permalink,
      subreddit: i.subreddit,
      createdUtc: i.createdUtc,
      numComments: i.numComments,
      ageDays: age,
      targetScore: Math.round(score),
      reasons,
      action,
      actionText: ACTION_TEXT[action],
      likelyArchived,
      engineCitations: cites,
    };
  });
  targets.sort((a, b) => b.targetScore - a.targetScore);
  return { status: 'ok', targets: targets.slice(0, cfg.maxTargets), citedThreads: cited, aeoSnapshotDate: aeo?.date ?? null };
}
