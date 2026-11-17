import { describe, expect, it } from 'vitest';
import { defaultAnalyticsConfig, type AiBot, type AnalyticsConfig, type RefererChannelRule } from '@jeldon/config';
import {
  aggregateDayDetail,
  analyticsConfigFromPack,
  classifyReferer,
  collectBeacon,
  detectAiCrawler,
  getArticleTrafficFor,
  InMemoryEventStore,
  looksLikeBot,
  parseEngagementBeacon,
  upsertArticleTrafficDay,
  type RawHitRow,
} from '../src/index.js';

describe('detectAiCrawler (default health pack)', () => {
  it('matches a specific token before its prefix (no shadowing)', () => {
    const claudeSearch = detectAiCrawler('Mozilla/5.0 (compatible; Claude-SearchBot/1.0)');
    expect(claudeSearch?.bot).toBe('Claude-SearchBot');
    expect(claudeSearch?.purpose).toBe('index');

    const claudeBot = detectAiCrawler('ClaudeBot/1.0 (+https://anthropic.com)');
    expect(claudeBot?.bot).toBe('ClaudeBot');
    expect(claudeBot?.purpose).toBe('train');
  });

  it('returns null for a real browser', () => {
    expect(detectAiCrawler('Mozilla/5.0 (Macintosh) Safari/605')).toBeNull();
    expect(detectAiCrawler(null)).toBeNull();
  });

  it('flags AI crawlers + automation as bots, real browsers as human', () => {
    expect(looksLikeBot('GPTBot/1.0')).toBe(true);
    expect(looksLikeBot('python-requests/2.31')).toBe(true);
    expect(looksLikeBot('')).toBe(true);
    expect(looksLikeBot('Mozilla/5.0 (Windows NT 10.0) Chrome/120')).toBe(false);
  });
});

describe('config-driven portability (no engine code changes)', () => {
  // A non-clinic pack: a fintech docs site that only cares about its own
  // research crawler and routes blog posts under /blog, not /articles.
  const fintechBots: AiBot[] = [
    { match: 'AcmeResearchBot', bot: 'AcmeResearchBot', engine: 'acme', purpose: 'index' },
  ];
  const fintechReferers: RefererChannelRule[] = [
    { hosts: ['acme.example'], drop: true },
    { label: 'Hacker News', hosts: ['news.ycombinator.com', 'hn.algolia.com'] },
    { label: 'GitHub', hosts: ['github.com'] },
  ];

  it('detects only the injected bot list', () => {
    expect(detectAiCrawler('GPTBot/1.0', fintechBots)).toBeNull();
    expect(detectAiCrawler('AcmeResearchBot/2', fintechBots)?.engine).toBe('acme');
  });

  it('classifies referers from the injected map; drops own domain; bare-host fallback', () => {
    expect(classifyReferer('news.ycombinator.com', fintechReferers)).toBe('Hacker News');
    expect(classifyReferer('app.acme.example', fintechReferers)).toBeNull();
    expect(classifyReferer('some-blog.dev', fintechReferers)).toBe('some-blog.dev');
    // Default map keeps the health semantics — different pack, different result.
    expect(classifyReferer('news.ycombinator.com')).toBe('news.ycombinator.com');
    expect(classifyReferer('google.com')).toBe('Google Search');
  });

  it('aggregateDayDetail joins article hits via the injected article-path regex', () => {
    const fintechCfg: AnalyticsConfig = {
      aiBotList: fintechBots,
      refererChannelMap: fintechReferers,
      directLabel: 'Direct',
      articlePathPattern: '^/blog/([a-z0-9-]+)/?$',
      assetPathPattern: '^/(assets|static)/',
      botUaPattern: 'bot|crawl|curl',
      siteRoute404Patterns: ['^/blog/[a-z0-9-]+/?$'],
      windowDays: 30,
      maxDailySnapshots: 365,
    };
    const rows: RawHitRow[] = [
      { path: '/blog/quic-deep-dive', ua: 'Mozilla/5.0 Chrome/120', status: 200, count: 9 },
      { path: '/blog/quic-deep-dive', ua: 'AcmeResearchBot/2', status: 200, count: 3 },
      { path: '/articles/ignored-by-this-pack', ua: 'Mozilla/5.0 Chrome/120', status: 200, count: 5 },
      { path: '/old-page', ua: 'curl/8', status: 404, count: 40 },
    ];
    const detail = aggregateDayDetail(rows, '2026-06-28', fintechCfg);
    expect(detail.articleHits['quic-deep-dive']).toEqual({ human: 9, bot: 3 });
    // /articles/* is NOT an article path under this pack, so it's not joined.
    expect(detail.articleHits['ignored-by-this-pack']).toBeUndefined();
    expect(detail.crawlerSnapshot.bots[0]?.bot).toBe('AcmeResearchBot');
    expect(detail.top404Paths.find((p) => p.path === '/old-page')?.requests).toBe(40);
  });
});

describe('aggregateDayDetail (default pack)', () => {
  it('splits article hits human/bot, snapshots crawlers, surfaces 404s', () => {
    const rows: RawHitRow[] = [
      { path: '/articles/low-back-pain', ua: 'Mozilla/5.0 Chrome/120', status: 200, count: 12 },
      { path: '/articles/low-back-pain', ua: 'PerplexityBot/1', status: 200, count: 4 },
      { path: '/wp-login.php', ua: 'curl/8', status: 404, count: 30 },
      { path: '/_astro/app.css', ua: 'Mozilla/5.0', status: 200, count: 99 },
    ];
    const detail = aggregateDayDetail(rows, '2026-06-28');
    expect(detail.articleHits['low-back-pain']).toEqual({ human: 12, bot: 4 });
    // Asset path excluded from top pages.
    expect(detail.topPaths.find((p) => p.path === '/_astro/app.css')).toBeUndefined();
    expect(detail.topPaths.find((p) => p.path === '/articles/low-back-pain')).toBeTruthy();
    const perplexity = detail.crawlerSnapshot.bots.find((b) => b.bot === 'PerplexityBot');
    expect(perplexity?.count).toBe(4);
    expect(detail.top404Paths.find((p) => p.path === '/wp-login.php')?.requests).toBe(30);
  });
});

describe('engagement beacon', () => {
  it('validates + parses each event type, rejecting junk', () => {
    expect(parseEngagementBeacon('{"slug":"my-post","t":"view","ref":"google.com"}', 1000)).toMatchObject({
      ts: 1000,
      slug: 'my-post',
      type: 'view',
      ref: 'google.com',
    });
    expect(parseEngagementBeacon('{"slug":"my-post","t":"dwell","ms":5000,"scroll":150}')?.scroll).toBe(100);
    expect(parseEngagementBeacon('{"slug":"bad slug!","t":"view"}')).toBeNull();
    expect(parseEngagementBeacon('{"slug":"ok","t":"bogus"}')).toBeNull();
    expect(parseEngagementBeacon('not json')).toBeNull();
    expect(parseEngagementBeacon('x'.repeat(2001))).toBeNull();
  });

  it('collectBeacon records valid events into a store and never throws', async () => {
    const store = new InMemoryEventStore();
    expect(await collectBeacon(store, '{"slug":"a","t":"view"}')).toBe(true);
    expect(await collectBeacon(store, 'garbage')).toBe(false);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]?.slug).toBe('a');
  });
});

describe('article-traffic reader + writeback', () => {
  it('upserts a day and sums per-slug over the window', () => {
    let store = upsertArticleTrafficDay(
      { lastUpdated: null, days: [] },
      '2026-06-27',
      { 'low-back-pain': { human: 5, bot: 2 } },
    );
    store = upsertArticleTrafficDay(store, '2026-06-28', { 'low-back-pain': { human: 3, bot: 1 } });
    const t = getArticleTrafficFor(store, 'low-back-pain', 30);
    expect(t.human).toBe(8);
    expect(t.bot).toBe(3);
    expect(t.total).toBe(11);
    expect(t.humanShare).toBeCloseTo(8 / 11);
  });
});

describe('hostname-anchored referer classification (BoH 2026-09-06 regression)', () => {
  it('does not report hosts ending in t.com as X', () => {
    expect(classifyReferer('reddit.com')).toBe('Reddit');
    expect(classifyReferer('www.reddit.com')).toBe('Reddit');
    expect(classifyReferer('chatgpt.com')).toBe('ChatGPT');
    expect(classifyReferer('pinterest.com')).toBe('Pinterest');
    expect(classifyReferer('t.co')).toBe('X / Twitter');
  });

  it('classifies the new channels', () => {
    expect(classifyReferer('claude.ai')).toBe('Claude');
    expect(classifyReferer('copilot.microsoft.com')).toBe('Copilot');
    expect(classifyReferer('nextdoor.com')).toBe('Nextdoor');
    expect(classifyReferer('redd.it')).toBe('Reddit');
  });

  it('matches UTM tokens exactly and hosts by domain, never by substring', () => {
    expect(classifyReferer('newsletter')).toBe('Newsletter');
    expect(classifyReferer('fb')).toBe('Facebook');
    expect(classifyReferer('ig')).toBe('Instagram');
    expect(classifyReferer('gbp')).toBe('Google Business');
    // `ig` / `fb` / `email` used to match any host containing them.
    expect(classifyReferer('bigcommerce.com')).toBe('bigcommerce.com');
    expect(classifyReferer('emailoctopus.com')).toBe('emailoctopus.com');
    expect(classifyReferer('notreddit.com')).toBe('notreddit.com');
    expect(classifyReferer('www.google.co.uk')).toBe('Google Search');
    expect(classifyReferer('https://l.facebook.com/l.php?u=x')).toBe('Facebook');
  });

  it('drops own-domain navigation from ownHosts / brand.siteUrl', () => {
    const cfg = analyticsConfigFromPack({ brand: { siteUrl: 'https://www.acme.example/' } } as never);
    expect(cfg.ownHosts).toContain('acme.example');
    expect(classifyReferer('blog.acme.example', cfg.refererChannelMap, cfg.directLabel, cfg.ownHosts)).toBeNull();
    expect(classifyReferer('acme.example.evil.com', cfg.refererChannelMap, cfg.directLabel, cfg.ownHosts)).toBe('acme.example.evil.com');
  });
});

describe('bot UA tokens are anchored', () => {
  it('counts the Pinterest and DuckDuckGo browsers as humans, their bots as bots', () => {
    const re = new RegExp(defaultAnalyticsConfig.botUaPattern, 'i');
    expect(re.test('Mozilla/5.0 (iPhone) Pinterest for iOS/12.0')).toBe(false);
    expect(re.test('Mozilla/5.0 (Linux; Android) DuckDuckGo/5')).toBe(false);
    expect(re.test('Pinterestbot/1.0')).toBe(true);
    expect(re.test('DuckDuckBot/1.1')).toBe(true);
    expect(re.test('DuckAssistBot/1.0')).toBe(true);
  });
});
