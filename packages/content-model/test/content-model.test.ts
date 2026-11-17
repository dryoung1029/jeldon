import { describe, expect, it } from 'vitest';
import { defaultScoringConfig, type DomainPack } from '@jeldon/config';
import {
  articleStatus,
  buildArticleSchema,
  isAutoPublishCandidate,
  isStub,
  parse,
  parseValue,
  publishScheduled,
  selectPublished,
  selectStubs,
  serialize,
  validateArticle,
  type ArticleDoc,
} from '../src/index.js';

// Two minimal packs that differ ONLY in their category taxonomy. The article
// schema must follow the pack — same engine code, different valid categories.
function makePack(categories: string[], targets: Record<string, number>): DomainPack {
  return {
    brand: { name: 'Test', siteUrl: 'https://example.com' },
    authors: [
      {
        slug: 'primary-author',
        name: 'Test Author',
        schemaId: 'https://example.com/#author',
        isPrimary: true,
        profile: { name: 'Test Author' },
      },
    ],
    voice: {
      persona: 'test',
      bannedTopics: [],
      bannedPhrasings: [],
      rules: [],
      voiceAnchorUrls: [],
      readingGradeBand: [6, 9],
    },
    content: {
      categories,
      categoryTargets: targets,
      defaultAuthorSlug: 'primary-author',
      timezone: 'America/Los_Angeles',
      lifecycle: { docReviewed: true },
    },
    scoring: defaultScoringConfig,
    citation: {
      policy: 'direct-source-urls',
      forbiddenPatterns: [],
      referenceFormat: 'Author, year. [link](URL)',
      verifier: { kind: 'none' },
    },
    aeo: {
      brandMentions: ['test'],
      querySet: [{ id: 'q1', query: 'q', tags: ['discovery'] }],
      engines: ['perplexity'],
      highPriorityTags: ['discovery'],
    },
    schema: {
      orgType: ['Organization'],
      org: { name: 'Test', url: 'https://example.com' },
      articleTypes: ['Article'],
    },
    capabilities: {},
    services: { store: 'fs', requiredEnv: [] },
  };
}

const bohPack = makePack(
  ['evidence', 'practice', 'education', 'investigation'],
  { evidence: 85, practice: 80, education: 90, investigation: 75 },
);
const devPack = makePack(['guide', 'evidence', 'opinion'], {
  guide: 85,
  evidence: 85,
  opinion: 75,
});

describe('frontmatter codec', () => {
  it('round-trips and preserves unknown frontmatter keys', () => {
    const raw = `---
title: "Hello"
draft: true
tags: ["a", "b"]
audioBodyLength: 10772
someUnknownField: "preserve me"
---
Body text here.`;
    const parsed = parse(raw);
    expect(parsed.frontmatter.title).toBe('Hello');
    expect(parsed.frontmatter.draft).toBe(true);
    expect(parsed.frontmatter.tags).toEqual(['a', 'b']);
    // numeric healing
    expect(parsed.frontmatter.audioBodyLength).toBe(10772);
    expect(typeof parsed.frontmatter.audioBodyLength).toBe('number');
    // unknown field survives a parse → serialize → parse cycle
    const round = parse(serialize(parsed));
    expect(round.frontmatter.someUnknownField).toBe('preserve me');
    expect(round.frontmatter.audioBodyLength).toBe(10772);
  });

  it('heals a stringly-quoted numeric (the build-killer bug)', () => {
    expect(parseValue('"10772"')).toBe(10772);
    expect(parseValue('0')).toBe(0);
    // leading-zero values stay strings (zip-code safety)
    expect(parseValue('"007"')).toBe('007');
  });

  it('does not accumulate backslashes on docNotes round-trips', () => {
    const doc = { frontmatter: { docNotes: 'He said "hi"\nthen left' }, body: 'x' };
    const once = parse(serialize(doc));
    const twice = parse(serialize(once));
    expect(twice.frontmatter.docNotes).toBe('He said "hi"\nthen left');
  });
});

describe('lifecycle state machine', () => {
  it('resolves all five states', () => {
    const opts = { docReviewedEnabled: true };
    expect(articleStatus({ draft: false }, opts)).toBe('live');
    expect(articleStatus({ draft: true, scheduled: true }, opts)).toBe('scheduled');
    expect(articleStatus({ draft: true, ready: true }, opts)).toBe('ready');
    expect(articleStatus({ draft: true, docReviewed: true }, opts)).toBe('docReviewed');
    expect(articleStatus({ draft: true }, opts)).toBe('draft');
  });

  it('collapses docReviewed into draft when the domain disables it', () => {
    expect(articleStatus({ draft: true, docReviewed: true })).toBe('draft');
  });

  it('stubs are ready/scheduled drafts; pure drafts are not', () => {
    expect(isStub({ draft: true, ready: true })).toBe(true);
    expect(isStub({ draft: true, scheduled: true })).toBe(true);
    expect(isStub({ draft: true })).toBe(false);
    expect(isStub({ draft: false })).toBe(false);
  });

  it('only scheduled drafts are auto-publish candidates', () => {
    expect(isAutoPublishCandidate({ draft: true, scheduled: true })).toBe(true);
    expect(isAutoPublishCandidate({ draft: true })).toBe(false);
  });

  it('selects published and stubs', () => {
    const list = [
      { draft: false },
      { draft: true, ready: true },
      { draft: true },
    ];
    expect(selectPublished(list)).toHaveLength(1);
    expect(selectPublished(list, { includeDrafts: true })).toHaveLength(3);
    expect(selectStubs(list)).toHaveLength(1);
  });
});

describe('pack-derived article schema (portability — no engine code change)', () => {
  it('accepts a category in the pack and rejects one that is not', () => {
    const fm = {
      title: 'T',
      excerpt: 'E',
      publishDate: '2026-01-01',
      category: 'investigation',
    };
    expect(validateArticle({ frontmatter: fm }, bohPack).ok).toBe(true);
    // 'investigation' is NOT in the dev pack's taxonomy
    const devResult = validateArticle({ frontmatter: fm }, devPack);
    expect(devResult.ok).toBe(false);
    expect(devResult.errors.some((e) => e.path === 'category')).toBe(true);
  });

  it('accepts the dev pack\'s own category and applies author defaults', () => {
    const result = validateArticle(
      { frontmatter: { title: 'T', excerpt: 'E', publishDate: '2026-01-01', category: 'guide' } },
      devPack,
    );
    expect(result.ok).toBe(true);
    expect(result.data?.author).toBe('Test Author');
    expect(result.data?.authorSlug).toBe('primary-author');
    expect(result.data?.draft).toBe(false);
  });

  it('throws if the pack has no categories', () => {
    const empty = makePack([], {});
    expect(() => buildArticleSchema(empty)).toThrow();
  });
});

describe('publishScheduled', () => {
  const tz = 'America/Los_Angeles';
  const article = (overrides: string): ArticleDoc => ({
    id: 'a.md',
    raw: `---
title: "Scheduled one"
publishDate: 2020-01-01
draft: true
scheduled: true
audioBodyLength: 500
${overrides}---
Body stays untouched.`,
  });

  it('flips a due scheduled draft and drops the scheduled line', () => {
    const result = publishScheduled([article('')], tz, new Date('2026-06-29T12:00:00Z'));
    expect(result.published).toHaveLength(1);
    const out = result.published[0]!.raw;
    expect(out).toContain('draft: false');
    expect(out).not.toContain('scheduled: true');
    // body + unknown numeric untouched
    expect(out).toContain('Body stays untouched.');
    expect(out).toContain('audioBodyLength: 500');
  });

  it('leaves future-dated and non-scheduled drafts alone', () => {
    const future: ArticleDoc = {
      id: 'f.md',
      raw: `---\ntitle: "Future"\npublishDate: 2099-01-01\ndraft: true\nscheduled: true\n---\nx`,
    };
    const plainDraft: ArticleDoc = {
      id: 'd.md',
      raw: `---\ntitle: "Plain"\npublishDate: 2020-01-01\ndraft: true\n---\nx`,
    };
    const result = publishScheduled([future, plainDraft], tz, new Date('2026-06-29T12:00:00Z'));
    expect(result.published).toHaveLength(0);
  });

  it('today is rendered in the configured timezone', () => {
    const result = publishScheduled([], tz, new Date('2026-06-29T05:00:00Z'));
    // 05:00 UTC is still 2026-06-28 in Los Angeles
    expect(result.today).toBe('2026-06-28');
  });
});

describe('2026-11 catch-up: provenance, video, hero paths', () => {
  const base = {
    title: 'T',
    excerpt: 'E',
    publishDate: '2026-11-01',
    category: 'guide',
  };

  it('parses autonomous and still accepts the deprecated docReviewed keys', async () => {
    const { validateArticle, isAutonomousDraft, articleStatus } = await import('../src/index.js');
    const r = validateArticle({ frontmatter: { ...base, draft: true, autonomous: true, docReviewed: true, docNotes: 'x' } }, devPack);
    expect(r.ok).toBe(true);
    expect(r.data?.autonomous).toBe(true);
    expect(isAutonomousDraft({ draft: true, autonomous: true })).toBe(true);
    expect(isAutonomousDraft({ draft: false, autonomous: true })).toBe(false);
    // Provenance does not change lifecycle.
    expect(articleStatus({ draft: true, ready: true })).toBe('ready');
  });

  it('parses every YouTube URL form and rejects non-YouTube video URLs', async () => {
    const { parseYouTubeUrl, validateArticle } = await import('../src/index.js');
    const id = 'dQw4w9WgXcQ';
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${id}&t=1m30s`)).toMatchObject({ videoId: id, startSeconds: 90 });
    expect(parseYouTubeUrl(`https://youtube.com/shorts/${id}`)).toMatchObject({ videoId: id, isShort: true });
    expect(parseYouTubeUrl(`https://youtu.be/${id}?t=42`)).toMatchObject({ videoId: id, startSeconds: 42 });
    expect(parseYouTubeUrl(`https://www.youtube-nocookie.com/embed/${id}?start=5`)).toMatchObject({ startSeconds: 5 });
    expect(parseYouTubeUrl(`https://www.youtube.com/live/${id}`)?.videoId).toBe(id);
    expect(parseYouTubeUrl(`https://m.youtube.com/watch?v=${id}`)?.watchUrl).toBe(`https://www.youtube.com/watch?v=${id}`);
    expect(parseYouTubeUrl('https://vimeo.com/123')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(validateArticle({ frontmatter: { ...base, videoUrl: 'https://vimeo.com/1' } }, devPack).ok).toBe(false);
    expect(validateArticle({ frontmatter: { ...base, videoUrl: `https://youtu.be/${id}`, videoUploadDate: '2026-10-01' } }, devPack).ok).toBe(true);
  });

  it('rejects hero paths outside the configured prefixes and paths that do not exist', async () => {
    const { validateArticle } = await import('../src/index.js');
    const pack = { ...devPack, content: { ...devPack.content, heroImagePathPrefixes: ['/img/'] } } as DomainPack;
    expect(validateArticle({ frontmatter: { ...base, heroImage: '/images/invented.png' } }, pack).ok).toBe(false);
    expect(validateArticle({ frontmatter: { ...base, heroImage: '/img/x/hero.png' } }, pack).ok).toBe(true);
    const missing = validateArticle({ frontmatter: { ...base, heroImage: '/img/x/gone.png' } }, pack, {
      heroImageExists: () => false,
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.path).toBe('heroImage');
  });
});

describe('topic clusters', () => {
  const clusters = [
    { id: 'hip', label: 'Hip', title: 't', description: 'd', tags: ['Hip Pain'], slugHints: ['hip', 'it-band'] },
    { id: 'va', label: 'VA', title: 't', description: 'd', tags: [], slugHints: ['va'], series: ['veterans'] },
  ];
  it('matches slug hints on whole hyphen segments only', async () => {
    const { articleClusterIds } = await import('../src/index.js');
    expect(articleClusterIds({ slug: 'what-is-chiropractic', tags: [] }, clusters)).toEqual([]);
    expect(articleClusterIds({ slug: 'whiplash-recovery', tags: [] }, clusters)).toEqual([]);
    expect(articleClusterIds({ slug: 'willamette-valley-care', tags: [] }, clusters)).toEqual([]);
    expect(articleClusterIds({ slug: 'hip-flexor-stretch', tags: [] }, clusters)).toEqual(['hip']);
    expect(articleClusterIds({ slug: 'runners-it-band-pain', tags: [] }, clusters)).toEqual(['hip']);
    expect(articleClusterIds({ slug: 'x', tags: ['hip pain'] }, clusters)).toEqual(['hip']);
    expect(articleClusterIds({ slug: 'x', tags: [], series: 'veterans' }, clusters)).toEqual(['va']);
  });
  it('only generates pages for clusters with enough live members', async () => {
    const { clusterPages, liveClusterIds, clusterPath } = await import('../src/index.js');
    const arts = [{ slug: 'hip-a', tags: [] }, { slug: 'hip-b', tags: [] }, { slug: 'va-claims', tags: [] }];
    expect(clusterPages(arts, { clusters }).map((p) => p.cluster.id)).toEqual(['hip']);
    expect([...liveClusterIds(arts, { clusters })]).toEqual(['hip']);
    expect([...liveClusterIds(arts, { clusters, minLiveArticles: 1 })].sort()).toEqual(['hip', 'va']);
    expect(clusterPath('hip', {})).toBe('/articles/topic/hip/');
  });
});
