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
