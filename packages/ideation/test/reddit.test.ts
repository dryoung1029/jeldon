import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot } from '@jeldon/aeo-audit';
import { defaultRedditListeningConfig } from '@jeldon/config';
import type { LlmRequest } from '@jeldon/drafting';
import { describe, expect, it } from 'vitest';
import {
  RedditReader,
  buildRedditBriefSystem,
  matchTerms,
  parseAtom,
  proposeRedditBriefs,
  runRedditRadar,
  scoreRedditTargets,
  type RadarItem,
  type RadarSnapshot,
} from '../src/index.js';
import { makePack, recordingProvider, res } from './fixtures.js';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const DAY = 86_400_000;

function listenPack(over: Partial<typeof defaultRedditListeningConfig> = {}) {
  return makePack({
    listening: {
      reddit: {
        ...defaultRedditListeningConfig,
        geoSubreddits: ['lakeside'],
        conditionSubreddits: [],
        brandTerms: ['northwind'],
        genericPhraseExclusions: { northwind: ['\\bnorthwind\\s+(?:gusts?|weather)\\b'] },
        serviceKeywords: ['tune-up'],
        targetSearches: [],
        requestDelayMs: 0,
        rssRetryMs: 10,
        ...over,
      },
    },
    competitors: {
      roster: [
        { id: 'a', name: 'Spokes & Co Cycles', url: 'https://a.example' },
        { id: 'b', name: 'Zap', url: 'https://b.example' },
      ],
      targetKeywords: [],
    },
  });
}

type Call = { url: string; method?: string };

function jsonListing(posts: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ data: { children: posts.map((data) => ({ data })) } }), { status: 200 });
}

const atom = (entries: Array<{ id: string; title: string; content?: string }>) =>
  `<feed>${entries
    .map(
      (e) =>
        `<entry><id>t3_${e.id}</id><title type="text">${e.title}</title><link href="https://www.reddit.com/r/lakeside/comments/${e.id}/x/"/><category term="lakeside"/><published>2026-11-16T00:00:00+00:00</published><content type="html">${e.content ?? ''}</content><author><name>/u/someone</name></author></entry>`,
    )
    .join('')}</feed>`;

function routedFetch(route: (url: string) => Response | Promise<Response>, calls: Call[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method });
    return route(url);
  }) as unknown as typeof fetch;
}

const post = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  subreddit: 'lakeside',
  title,
  permalink: `/r/lakeside/comments/${id}/slug/`,
  author: 'u',
  created_utc: (NOW - DAY) / 1000,
  score: 5,
  num_comments: 3,
  selftext: '',
  ...extra,
});

describe('matching', () => {
  it('is word-bounded and drops generic phrasings of a brand term', () => {
    expect(matchTerms('Northwind fixed my wheel', ['northwind'])).toEqual(['northwind']);
    expect(matchTerms('Northwinds are cold', ['northwind'])).toEqual([]);
    const ex = { northwind: ['\\bnorthwind\\s+(?:gusts?|weather)\\b'] };
    expect(matchTerms('the northwind gusts hit 40mph', ['northwind'], ex)).toEqual([]);
    expect(matchTerms('northwind gusts, then I went to Northwind for a tune-up', ['northwind'], ex)).toEqual(['northwind']);
  });

  it('parses Atom entries whose elements carry attributes; RSS counts stay null', () => {
    const [p] = parseAtom(atom([{ id: 'abc', title: 'Hi &amp; bye', content: '&lt;p&gt;body&lt;/p&gt;' }]));
    expect(p).toMatchObject({ id: 'abc', title: 'Hi & bye', subreddit: 'lakeside', score: null, num_comments: null });
    expect(p!.selftext.trim()).toBe('body');
  });
});

describe('RedditReader', () => {
  const opts = (fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof RedditReader>[0]> = {}) => ({
    fetchImpl,
    userAgent: 'ua',
    rssRetryMs: 10,
    maxRssRetries: 3,
    retryDeadline: Number.POSITIVE_INFINITY,
    sleep: async () => {},
    warn: () => {},
    ...extra,
  });
  const src = { jsonUrl: 'https://www.reddit.com/a.json', rssUrl: 'https://www.reddit.com/a.rss', label: 'a' };

  it('falls back from a 403 JSON to RSS, retrying 429s', async () => {
    let rss = 0;
    const calls: Call[] = [];
    const reader = new RedditReader(
      opts(
        routedFetch((u) => {
          if (u.endsWith('.json')) return new Response('', { status: 403 });
          rss++;
          return rss < 3 ? new Response('', { status: 429 }) : new Response(atom([{ id: 'x', title: 't' }]), { status: 200 });
        }, calls),
      ),
    );
    const posts = await reader.fetchPosts(src);
    expect(posts?.map((p) => p.id)).toEqual(['x']);
    expect(calls.map((c) => c.url)).toEqual([src.jsonUrl, src.rssUrl, src.rssUrl, src.rssUrl]);
  });

  it('gives up when the retry budget is spent', async () => {
    const warnings: string[] = [];
    const reader = new RedditReader(
      opts(routedFetch((u) => new Response('', { status: u.endsWith('.json') ? 403 : 429 })), {
        retryDeadline: 0,
        warn: (m) => warnings.push(m),
      }),
    );
    expect(await reader.fetchPosts(src)).toBeNull();
    expect(warnings.join(' ')).toMatch(/retry budget spent/);
  });

  it('only ever sends GET, and only to reddit.com', async () => {
    const calls: Call[] = [];
    const reader = new RedditReader(opts(routedFetch(() => jsonListing([]), calls)));
    await reader.fetchPosts(src);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    const evil = new RedditReader(opts(routedFetch(() => jsonListing([]), calls), { warn: () => {} }));
    expect(await evil.fetchPosts({ jsonUrl: 'https://evil.example/x', rssUrl: 'https://notreddit.com/x', label: 'x' })).toBeNull();
    expect(calls.some((c) => c.url.includes('evil.example') || c.url.includes('notreddit.com'))).toBe(false);
  });

  it('has no write path in source (no POST/PUT/PATCH/DELETE, no submit/comment endpoints)', () => {
    const dir = join(__dirname, '../src/reddit');
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(text).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
      expect(text).not.toMatch(/\/api\/(submit|comment|vote|del)\b/);
    }
  });
});

describe('runRedditRadar', () => {
  it('is not_configured without listening.reddit', async () => {
    expect((await runRedditRadar(makePack(), { fetchImpl: routedFetch(() => jsonListing([])) })).status).toBe('not_configured');
  });

  it('classifies brand > competitor (from the roster) > service, skipping short competitor names', async () => {
    const calls: Call[] = [];
    const r = await runRedditRadar(listenPack(), {
      now: () => NOW,
      sleep: async () => {},
      fetchImpl: routedFetch(
        (u) =>
          u.includes('/r/lakeside/new.json')
            ? jsonListing([
                post('b1', 'Northwind did my wheel'),
                post('b2', 'The northwind gusts are brutal today'),
                post('c1', 'Anyone tried Spokes & Co Cycles?'),
                post('c2', 'Zap is great'),
                post('s1', 'Where to get a tune-up?'),
              ])
            : jsonListing([]),
        calls,
      ),
    });
    if (r.status !== 'ok') throw new Error(r.status);
    const kinds = Object.fromEntries(r.snapshot.items.map((i) => [i.id, i.kind]));
    expect(kinds).toEqual({ b1: 'brand', c1: 'competitor', s1: 'local-opportunity' });
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls[0]!.url).toMatch(/^https:\/\/www\.reddit\.com\//);
  });

  it('keeps the previous snapshot untouched when every request fails', async () => {
    const previous: RadarSnapshot = { lastRun: 'x', warnings: [], items: [] };
    const r = await runRedditRadar(listenPack(), {
      now: () => NOW,
      sleep: async () => {},
      previous,
      fetchImpl: routedFetch(() => new Response('', { status: 403 })),
    });
    expect(r.status).toBe('all_failed');
    expect(r.status === 'all_failed' && r.snapshot).toBe(previous);
  });

  it('merges: firstSeen and a stronger earlier kind survive, counts are not downgraded to null, evergreen escapes retention', async () => {
    const old = new Date(NOW - 400 * DAY).toISOString();
    const previous: RadarSnapshot = {
      lastRun: 'x',
      warnings: [],
      items: [
        { id: 'b1', kind: 'brand', subreddit: 'lakeside', title: 't', permalink: 'p', author: 'a', createdUtc: new Date(NOW - DAY).toISOString(), score: 9, numComments: 7, matched: ['northwind'], firstSeen: '2026-01-01T00:00:00.000Z' },
        { id: 'ev', kind: 'evergreen', subreddit: 'lakeside', title: 'old classic', permalink: 'p', author: 'a', createdUtc: old, score: null, numComments: null, matched: [], searchRank: 1, searchKey: 'k' },
        { id: 'stale', kind: 'condition', subreddit: 'x', title: 'old q?', permalink: 'p', author: 'a', createdUtc: old, score: null, numComments: null, matched: [] },
      ],
    };
    const r = await runRedditRadar(listenPack(), {
      now: () => NOW,
      sleep: async () => {},
      previous,
      fetchImpl: routedFetch((u) =>
        u.endsWith('.json') || u.includes('.json?')
          ? new Response('', { status: 403 })
          : new Response(atom([{ id: 'b1', title: 'need a tune-up' }]), { status: 200 }),
      ),
    });
    if (r.status !== 'ok') throw new Error(r.status);
    const b1 = r.snapshot.items.find((i) => i.id === 'b1')!;
    expect(b1.kind).toBe('brand');
    expect(b1.firstSeen).toBe('2026-01-01T00:00:00.000Z');
    expect(b1.score).toBe(9);
    expect(b1.numComments).toBe(7);
    expect(r.snapshot.items.map((i) => i.id)).toContain('ev');
    expect(r.snapshot.items.map((i) => i.id)).not.toContain('stale');
  });
});

describe('scoreRedditTargets', () => {
  const item = (id: string, ageDays: number, kind: RadarItem['kind'] = 'local-opportunity'): RadarItem => ({
    id,
    kind,
    subreddit: 'lakeside',
    title: id,
    permalink: `https://www.reddit.com/r/lakeside/comments/${id}/x/`,
    author: 'a',
    createdUtc: new Date(NOW - ageDays * DAY).toISOString(),
    score: null,
    numComments: null,
    matched: ['tune-up'],
  });
  const aeo: Snapshot = {
    date: '2026-11-10',
    engines: ['perplexity', 'openai'],
    queryCount: 1,
    results: [
      {
        queryId: 'q1',
        engines: {
          perplexity: { redditCitations: [{ url: 'https://old.reddit.com/r/lakeside/comments/OLD1/x', rank: 2 }] },
          openai: { redditCitations: [{ url: 'https://www.reddit.com/r/lakeside/comments/old1/other_slug/', rank: 1 }, { url: 'https://www.reddit.com/r/lakeside/comments/fresh1/x/', rank: 3 }] },
        },
      },
    ],
  };
  const pack = () => ({ ...listenPack(), aeo: { querySet: [{ id: 'q1', query: 'best bike shop', tags: [] }] } as any });

  it('ranks engine-cited threads first and aggregates URL variants on the thread id', () => {
    const r = scoreRedditTargets({ lastRun: null, warnings: [], items: [item('fresh0', 1), item('fresh1', 5), item('old1', 10)] }, aeo, pack(), { now: NOW });
    expect(r.citedThreads[0]).toMatchObject({ key: 'thread:old1' });
    expect(r.citedThreads[0]!.citedBy).toHaveLength(2);
    expect(r.targets[0]!.id).toBe('old1');
    expect(r.targets[1]!.id).toBe('fresh1');
    expect(r.targets[2]!.id).toBe('fresh0');
  });

  it('an engine-cited thread past archivedAfterDays becomes an out-publish brief, not a reply target', () => {
    const r = scoreRedditTargets({ lastRun: null, warnings: [], items: [item('old1', 176), item('fresh1', 174)] }, aeo, pack(), { now: NOW });
    const byId = Object.fromEntries(r.targets.map((t) => [t.id, t]));
    expect(byId.old1).toMatchObject({ likelyArchived: true, action: 'out-publish' });
    expect(byId.old1!.actionText).toMatch(/Out-publish it/);
    expect(byId.fresh1).toMatchObject({ likelyArchived: false, action: 'answer-cited' });
  });

  it('applies the recency bands and the stale penalty', () => {
    const r = scoreRedditTargets(
      { lastRun: null, warnings: [], items: [item('a', 1), item('b', 10), item('c', 60), item('d', 300), item('e', 500)] },
      null,
      pack(),
      { now: NOW },
    );
    const s = Object.fromEntries(r.targets.map((t) => [t.id, t.targetScore]));
    expect(s).toEqual({ a: 30 + 45, b: 30 + 35, c: 30 + 22, d: 30 + 10, e: 30 - 35 });
    expect(r.aeoSnapshotDate).toBeNull();
  });
});

describe('proposeRedditBriefs', () => {
  const aeo: Snapshot = {
    date: '2026-11-10',
    engines: ['perplexity'],
    queryCount: 1,
    results: [{ queryId: 'q1', engines: { perplexity: { redditCitations: [{ url: 'https://www.reddit.com/r/lakeside/comments/old1/best_shop/', rank: 1 }] } } }],
  };
  const radar: RadarSnapshot = {
    lastRun: null,
    warnings: [],
    items: [
      {
        id: 'old1',
        kind: 'evergreen',
        subreddit: 'lakeside',
        title: 'Best shop in town?',
        permalink: 'https://www.reddit.com/r/lakeside/comments/old1/best_shop/',
        author: 'a',
        createdUtc: new Date(NOW - 900 * DAY).toISOString(),
        score: null,
        numComments: null,
        matched: [],
        searchRank: 1,
        searchKey: 'r/lakeside · "bike shop"',
      },
    ],
  };
  const pack = () => ({ ...listenPack(), aeo: { querySet: [{ id: 'q1', query: 'best bike shop lakeside', tags: [] }] } as any });

  it('system prompt: listening only, never retell a thread as the brand\'s own case, built from the pack', () => {
    const s = buildRedditBriefSystem(pack());
    expect(s).toContain("never retell one as if it were Northwind Bikes's own case");
    expect(s).toContain('This is listening only. Never draft a Reddit reply');
    expect(s).toContain('Lakeside and Hilltown');
    expect(s).toContain('repair | buying');
  });

  it('marks archived cited threads OUT-PUBLISH and sends the brief call with toolName + effort', async () => {
    const calls: LlmRequest[] = [];
    const r = await proposeRedditBriefs(
      { radar, aeo, inventory: [], backlog: [] },
      {
        pack: pack(),
        now: NOW,
        provider: recordingProvider(
          () => res([{ type: 'tool_use', name: 'propose_backlog', input: { proposals: [], summary: 'all covered' } }]),
          calls,
        ),
      },
    );
    const msg = String(calls[0]!.messages[0]!.content);
    expect(msg).toContain('"Best shop in town?"');
    expect(msg).toContain('OUT-PUBLISH');
    expect(msg).toContain('"best bike shop lakeside"');
    expect(calls[0]!.toolName).toBe('propose_backlog');
    expect(calls[0]!.effort).toBe('medium');
    // An empty list is a valid answer (minItems 0), reported as ok with zero proposals.
    expect((calls[0]!.tools![0]!.input_schema as any).properties.proposals.minItems).toBe(0);
    expect(r).toMatchObject({ status: 'ok', proposals: [], outPublishCount: 1, citedThreadCount: 1 });
  });

  it('returns no_signal (and makes no call) when there is nothing to brief', async () => {
    const calls: LlmRequest[] = [];
    const r = await proposeRedditBriefs(
      { radar: { lastRun: null, warnings: [], items: [] }, aeo: null, inventory: [], backlog: [] },
      { pack: pack(), provider: recordingProvider(() => res([]), calls) },
    );
    expect(r.status).toBe('no_signal');
    expect(calls).toHaveLength(0);
  });
});
