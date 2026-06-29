import { describe, expect, it } from 'vitest';
import type { AeoQuery } from '@jeldon/config';
import {
  aggregate,
  brandMatchFromPack,
  buildEngines,
  parseCitations,
  runAudit,
  upsertSnapshot,
  NullSnapshotStore,
  type Engine,
  type Snapshot,
  type SnapshotStoreData,
} from '../src/index.js';

describe('parseCitations', () => {
  const brand = { url: 'example.com', mentions: ['Acme Clinic', 'Dr. Test'] };

  it('finds the 1-indexed rank of the first brand URL and flags brand mentions', () => {
    const r = parseCitations(
      ['https://other.com/a', 'https://www.example.com/care', 'https://x.com'],
      'According to Dr. Test at Acme Clinic, the answer is yes.',
      brand,
    );
    expect(r.cited).toBe(true);
    expect(r.citationRank).toBe(2);
    expect(r.totalCitations).toBe(3);
    expect(r.brandMentioned).toBe(true);
  });

  it('reports not-cited when no URL matches, even with a prose mention', () => {
    const r = parseCitations(['https://other.com'], 'Acme Clinic is great.', brand);
    expect(r.cited).toBe(false);
    expect(r.citationRank).toBeNull();
    expect(r.brandMentioned).toBe(true);
  });
});

describe('runAudit with a fake engine registry', () => {
  const queries: AeoQuery[] = [
    { id: 'q1', query: 'best widget shop', tags: ['local', 'discovery'] },
    { id: 'q2', query: 'how widgets work', tags: ['education'] },
  ];
  const brand = { url: 'example.com', mentions: ['Acme'] };

  it('runs every engine against every query and parses citations', async () => {
    const engines: Engine[] = [
      {
        name: 'perplexity',
        fn: async (q) =>
          q.includes('best')
            ? { urls: ['https://example.com/x'], text: 'Acme is the best.' }
            : { urls: ['https://other.com'], text: 'Generic answer.' },
      },
    ];
    const snap = await runAudit(queries, engines, { brand, now: new Date('2026-06-01T12:00:00Z') });
    expect(snap.queryCount).toBe(2);
    expect(snap.engines).toEqual(['perplexity']);
    const q1 = snap.results.find((r) => r.queryId === 'q1')!;
    expect(q1.engines.perplexity?.cited).toBe(true);
    expect(q1.engines.perplexity?.citationRank).toBe(1);
    const q2 = snap.results.find((r) => r.queryId === 'q2')!;
    expect(q2.engines.perplexity?.cited).toBe(false);
  });

  it('captures an engine error without failing the run', async () => {
    const engines: Engine[] = [
      { name: 'anthropic', fn: async () => ({ error: 'Anthropic 529: overloaded' }) },
    ];
    const snap = await runAudit(queries, engines, { brand });
    expect(snap.results[0]?.engines.anthropic?.error).toMatch(/529/);
  });

  it('marks google-aio no-AIO results so they are excluded downstream', async () => {
    const engines: Engine[] = [
      { name: 'google-aio', fn: async () => ({ urls: [], text: '', noAiOverview: true }) },
    ];
    const snap = await runAudit(queries, engines, { brand });
    expect(snap.results[0]?.engines['google-aio']?.noAiOverview).toBe(true);
  });
});

describe('buildEngines registry', () => {
  it('drops engines whose API key is missing and skips unbuilt openai', () => {
    const engines = buildEngines(['perplexity', 'anthropic', 'google-aio', 'openai'], {
      perplexity: 'pk',
      // anthropic + serpapi absent
    });
    expect(engines.map((e) => e.name)).toEqual(['perplexity']);
  });
});

describe('upsertSnapshot', () => {
  it('replaces a same-date row, sorts, and trims to maxSnapshots', () => {
    const base: SnapshotStoreData = { lastUpdated: null, maxSnapshots: 2, snapshots: [] };
    const mk = (date: string): Snapshot => ({ date, engines: [], queryCount: 0, results: [] });
    let store = upsertSnapshot(base, mk('2026-05-01'));
    store = upsertSnapshot(store, mk('2026-05-08'));
    store = upsertSnapshot(store, mk('2026-05-15')); // trims out the oldest
    expect(store.snapshots.map((s) => s.date)).toEqual(['2026-05-08', '2026-05-15']);
    // Same-date upsert replaces, not appends.
    const replaced = upsertSnapshot(store, { ...mk('2026-05-15'), queryCount: 9 });
    expect(replaced.snapshots).toHaveLength(2);
    expect(replaced.snapshots.find((s) => s.date === '2026-05-15')?.queryCount).toBe(9);
  });
});

describe('aggregate', () => {
  const queries: AeoQuery[] = [
    { id: 'q1', query: 'best widget shop', tags: ['local', 'discovery'] },
    { id: 'q2', query: 'how widgets work', tags: ['education'] },
  ];

  const prev: Snapshot = {
    date: '2026-05-25',
    engines: ['perplexity'],
    queryCount: 2,
    results: [
      { queryId: 'q1', engines: { perplexity: { cited: true, citationRank: 1, brandMentioned: true } } },
      { queryId: 'q2', engines: { perplexity: { cited: false, brandMentioned: false } } },
    ],
  };
  const latest: Snapshot = {
    date: '2026-06-01',
    engines: ['perplexity'],
    queryCount: 2,
    results: [
      // q1 was cited, now lost -> drop + high-priority action item.
      { queryId: 'q1', engines: { perplexity: { cited: false, brandMentioned: true } } },
      // q2 cited at rank 6 -> "climb" action item.
      { queryId: 'q2', engines: { perplexity: { cited: true, citationRank: 6, brandMentioned: true } } },
    ],
  };
  const store: SnapshotStoreData = {
    lastUpdated: '2026-06-01T00:00:00Z',
    maxSnapshots: 52,
    snapshots: [prev, latest],
  };

  it('computes engine stats, wins/drops, and trend', () => {
    const out = aggregate(store, { queries, highPriorityTags: ['local', 'discovery'], brandName: 'Acme' });
    expect(out.hasData).toBe(true);
    expect(out.latestDate).toBe('2026-06-01');
    const ppx = out.engineStats.find((s) => s.engine === 'perplexity')!;
    expect(ppx.total).toBe(2);
    expect(ppx.cited).toBe(1);
    expect(out.drops).toHaveLength(1);
    expect(out.drops[0]?.queryId).toBe('q1');
    expect(out.trend).toHaveLength(2);
  });

  it('produces action items reflecting the data (lost citation high; climb medium)', () => {
    const out = aggregate(store, { queries, highPriorityTags: ['local', 'discovery'], brandName: 'Acme' });
    const lost = out.actionItems.find((a) => a.action.includes('lost citation'));
    expect(lost?.priority).toBe('high');
    const climb = out.actionItems.find((a) => a.action.includes('Climb'));
    expect(climb?.priority).toBe('medium');
  });

  it('excludes google-aio no-opportunity rows from the citation-rate denominator', () => {
    const noAio: SnapshotStoreData = {
      lastUpdated: null,
      maxSnapshots: 52,
      snapshots: [
        {
          date: '2026-06-01',
          engines: ['google-aio'],
          queryCount: 1,
          results: [{ queryId: 'q1', engines: { 'google-aio': { noAiOverview: true } } }],
        },
      ],
    };
    const out = aggregate(noAio, { queries });
    const g = out.engineStats.find((s) => s.engine === 'google-aio')!;
    expect(g.total).toBe(0);
    expect(g.noOpportunity).toBe(1);
  });
});

describe('config-driven portability (no engine code changes)', () => {
  it('a different pack changes the brand matched + action-item priority', async () => {
    // Two packs with different brand hosts + high-priority tags. Same engine
    // code; behavior differs purely from config.
    const healthPack = {
      brand: { name: 'Body of Health', siteUrl: 'https://yourbodyofhealth.com' },
      aeo: { brandMentions: ['body of health', 'dr. young'] },
    };
    const devopsPack = {
      brand: { name: 'Northwatch', siteUrl: 'https://www.northwatch.io' },
      aeo: { brandMentions: ['northwatch'] },
    };
    expect(brandMatchFromPack(healthPack as never).url).toBe('yourbodyofhealth.com');
    expect(brandMatchFromPack(devopsPack as never).url).toBe('northwatch.io');

    const queries: AeoQuery[] = [{ id: 'q1', query: 'q', tags: ['ops'] }];
    const engine: Engine[] = [
      { name: 'perplexity', fn: async () => ({ urls: ['https://other.com'], text: 'no match' }) },
    ];
    const snap = await runAudit(queries, engine, { brand: brandMatchFromPack(devopsPack as never) });
    const store = new NullSnapshotStore();
    await store.write(upsertSnapshot(await store.read(), snap));
    // 'ops' is high-priority for devops but not for health -> different item priority.
    const devOut = aggregate(await store.read(), { queries, highPriorityTags: ['ops'], brandName: 'Northwatch' });
    const healthOut = aggregate(await store.read(), { queries, highPriorityTags: ['local'], brandName: 'Body of Health' });
    expect(devOut.actionItems[0]?.priority).toBe('high');
    expect(healthOut.actionItems[0]?.priority).toBe('medium');
  });
});
