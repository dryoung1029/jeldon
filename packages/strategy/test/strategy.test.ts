import { describe, expect, it } from 'vitest';
import { defaultStrategyConfig, type StrategyConfig } from '@jeldon/config';
import {
  buildRecommendations,
  defaultRuleSet,
  type RuleSet,
  type StrategyInput,
} from '../src/index.js';

const categoryTargets = { education: 90, evidence: 85, practice: 80, investigation: 75 };

const baseInput: StrategyInput = {
  cf: {
    windowDays: 30,
    referrersDays: 30,
    topPaths: [
      { path: '/articles/back-pain-when-standing-up', requests: 1200 },
      { path: '/articles/chiropractor-vs-physical-therapist', requests: 800 },
    ],
    top404Paths: [
      { path: '/articles/old-removed-post', requests: 64 },
      { path: '/wp-cron.php', requests: 4200 }, // noise — excluded
      { path: '/articles/one-off-probe', requests: 3 }, // below floor
    ],
    referrers: [
      { source: 'Google Search', requests: 900 },
      { source: 'Direct', requests: 200 },
    ],
    statuses: [
      { status: 200, requests: 50000 },
      { status: 502, requests: 600 },
    ],
  },
  crawlers: { totalHits: 100, bots: [{ purpose: 'live', count: 12 }, { purpose: 'index', count: 88 }] },
  articles: [
    { slug: 'back-pain-when-standing-up', title: 'Back pain when standing up', category: 'education', geo: 60, seo: 80, hasAudio: false },
    { slug: 'chiropractor-vs-physical-therapist', title: 'Chiropractor vs PT', category: 'education', geo: 95, seo: 85, hasAudio: false },
  ],
  keywords: [
    { keyword: 'chiropractor corvallis', ourRank: 6 },
    { keyword: 'back pain treatment', ourRank: 2 },
  ],
};

describe('buildRecommendations — default pack (BoH-equivalent)', () => {
  it('flags a real 404 on a content path and excludes bot/probe noise', () => {
    const recs = buildRecommendations(baseInput, defaultRuleSet, { categoryTargets });
    const r404 = recs.find((r) => r.id === 'health-404');
    expect(r404).toBeDefined();
    expect(r404?.priority).toBe('high'); // 64 >= 50
    expect(r404?.evidence).toContain('/articles/old-removed-post (64)');
    expect(r404?.evidence).not.toContain('wp-cron');
    expect(r404?.evidence).not.toContain('one-off-probe');
    expect(r404?.link).toBe('/admin/links');
  });

  it('fires a 5xx health rec when server errors exceed the floor', () => {
    const recs = buildRecommendations(baseInput, defaultRuleSet, { categoryTargets });
    const r5xx = recs.find((r) => r.id === 'health-5xx');
    expect(r5xx).toBeDefined();
    expect(r5xx?.evidence).toContain('502×600');
  });

  it('recommends strengthening a high-traffic low-GEO page for AI citation', () => {
    const recs = buildRecommendations(baseInput, defaultRuleSet, { categoryTargets });
    const geo = recs.find((r) => r.id === 'geo-back-pain-when-standing-up');
    expect(geo).toBeDefined();
    expect(geo?.priority).toBe('high'); // rank 1
    expect(geo?.evidence).toContain('GEO 60');
    expect(geo?.evidence).toContain('90'); // education target
    // The well-scored sibling (GEO 95) must NOT generate a citability rec.
    expect(recs.find((r) => r.id === 'geo-chiropractor-vs-physical-therapist')).toBeUndefined();
  });

  it('surfaces a page-2→1 climb but not a #2 ranker', () => {
    const recs = buildRecommendations(baseInput, defaultRuleSet, { categoryTargets });
    expect(recs.find((r) => r.id === 'climb-chiropractor corvallis')).toBeDefined();
    expect(recs.find((r) => r.id === 'climb-back pain treatment')).toBeUndefined();
  });

  it('keeps audio + live-crawl rules OFF by default (opt-in surfaces)', () => {
    const recs = buildRecommendations(baseInput, defaultRuleSet, { categoryTargets });
    expect(recs.some((r) => r.id.startsWith('audio-'))).toBe(false);
    expect(recs.find((r) => r.id === 'aeo-live')).toBeUndefined();
  });

  it('runs audio + live-crawl when explicitly enabled', () => {
    const ruleSet: RuleSet = {
      rules: [
        { id: 'audio-coverage', enabled: true },
        { id: 'aeo-live-crawl', enabled: true },
      ],
    };
    const recs = buildRecommendations(baseInput, ruleSet, { categoryTargets });
    expect(recs.find((r) => r.id === 'audio-back-pain-when-standing-up')).toBeDefined();
    expect(recs.find((r) => r.id === 'aeo-live')).toBeDefined();
  });

  it('sorts high → medium → low and caps at maxRecommendations', () => {
    const recs = buildRecommendations(baseInput, defaultRuleSet, { categoryTargets });
    const order = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < recs.length; i++) {
      expect(order[recs[i]!.priority]).toBeGreaterThanOrEqual(order[recs[i - 1]!.priority]);
    }
    expect(recs.length).toBeLessThanOrEqual(defaultStrategyConfig.thresholds.maxRecommendations);
  });
});

describe('config-driven portability (no engine code changes)', () => {
  it('re-points 404 detection + re-voices copy + re-targets deep-links for a non-content domain', () => {
    // A SaaS docs site: content lives under /docs and /guides, admin is /studio.
    const saasCfg: StrategyConfig = {
      ...defaultStrategyConfig,
      siteRoute404Patterns: ['^/docs/[a-z0-9-]+/?$', '^/guides/[a-z0-9-]+/?$'],
      articlePathPattern: '^/docs/([^/]+)$',
      deepLinks: {
        ...defaultStrategyConfig.deepLinks,
        brokenLinks: { link: '/studio/links', linkLabel: 'Link audit' },
      },
      copy: {
        ...defaultStrategyConfig.copy,
        'health-404': { title: 'Dead doc links', evidence: 'Docs 404ing: {offenders}. Redirect them.' },
      },
    };
    const input: StrategyInput = {
      ...baseInput,
      cf: {
        ...baseInput.cf!,
        top404Paths: [
          { path: '/docs/removed-guide', requests: 30 },
          { path: '/articles/old-removed-post', requests: 64 }, // NOT a route on this domain now
        ],
        topPaths: [],
      },
      articles: [],
      keywords: [],
    };
    const recs = buildRecommendations(input, { rules: [{ id: 'health-404', enabled: true }] }, {
      categoryTargets,
      cfg: saasCfg,
    });
    const r404 = recs.find((r) => r.id === 'health-404');
    expect(r404).toBeDefined();
    expect(r404?.title).toBe('Dead doc links'); // re-voiced
    expect(r404?.evidence).toContain('/docs/removed-guide (30)');
    expect(r404?.evidence).not.toContain('old-removed-post'); // not a route here anymore
    expect(r404?.link).toBe('/studio/links'); // re-targeted deep-link
  });

  it('treats X / Telegram as the social channels for a different domain', () => {
    const cfg: StrategyConfig = {
      ...defaultStrategyConfig,
      refererGroups: { social: ['t.me', 'reddit'], search: ['bing'] },
    };
    const input: StrategyInput = {
      ...baseInput,
      cf: {
        ...baseInput.cf!,
        referrers: [
          { source: 'Bing', requests: 500 },
          { source: 'reddit.com', requests: 3 },
        ],
        top404Paths: [],
        topPaths: [],
        statuses: [],
      },
      keywords: [],
    };
    const recs = buildRecommendations(input, { rules: [{ id: 'dist-social', enabled: true }, { id: 'seo-climb', enabled: true }] }, {
      categoryTargets,
      cfg,
    });
    // Search referrers come from Bing here, so the climb rule's gate passes too.
    expect(recs.find((r) => r.id === 'dist-social')).toBeDefined();
  });
});
