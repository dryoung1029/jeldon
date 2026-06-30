import { defaultScoringConfig } from '@jeldon/config';
import { describe, expect, it } from 'vitest';
import { reconcileTags, selectTags } from '../src/tags.js';
import type { DraftingPack } from '../src/types.js';

const BAND = { min: 3, max: 6 }; // defaultScoringConfig.seo.tags.good

/** Minimal pack carrying only what reconcileTags reads. */
function tagPack(tags?: string[]): DraftingPack {
  return {
    content: { categories: ['guide'], categoryTargets: { guide: 80 }, tags, defaultAuthorSlug: 'a', timezone: 'UTC' },
    scoring: defaultScoringConfig,
  } as unknown as DraftingPack;
}

describe('selectTags', () => {
  const vocab = ['Kubernetes', 'Latency', 'Observability', 'on-call'];

  it('keeps in-vocabulary model tags, drops invented ones, normalizes to vocab casing', () => {
    const out = selectTags(['kubernetes', 'astrology', 'LATENCY'], vocab, '', BAND);
    expect(out).toContain('Kubernetes');
    expect(out).toContain('Latency');
    expect(out).not.toContain('astrology');
  });

  it('backfills from the vocabulary by relevance to reach the band minimum', () => {
    const text = 'we reduced latency by tracing requests across the observability stack';
    const out = selectTags([], vocab, text, BAND);
    expect(out).toHaveLength(3);
    // The two relevant terms rank first; the third is filled by vocab order.
    expect(out.slice(0, 2)).toEqual(['Latency', 'Observability']);
    expect(out[2]).toBe('Kubernetes');
  });

  it('clamps to the band maximum', () => {
    const big = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(selectTags(big, big, '', BAND)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('falls back to verbatim model tags when no vocabulary is configured', () => {
    const out = selectTags(['x-ray', 'imaging', 'astrology', 'foo', 'bar', 'baz', 'qux'], [], '', BAND);
    expect(out).toEqual(['x-ray', 'imaging', 'astrology', 'foo', 'bar', 'baz']);
  });

  it('is deterministic — ties break by vocabulary order', () => {
    const a = selectTags([], vocab, '', BAND);
    const b = selectTags([], vocab, '', BAND);
    expect(a).toEqual(b);
    expect(a).toEqual(['Kubernetes', 'Latency', 'Observability']); // all zero-relevance → vocab order
  });
});

describe('reconcileTags', () => {
  const pack = tagPack(['kubernetes', 'latency', 'observability', 'on-call']);

  it('rewrites the tags line: drops off-vocab tags and backfills by relevance', () => {
    const md = [
      '---',
      'title: Cutting tail latency',
      'excerpt: e',
      'category: guide',
      'tags: ["astrology", "latency"]',
      'draft: true',
      '---',
      'We traced requests to cut latency in our observability stack.',
    ].join('\n');
    const out = reconcileTags(md, pack);
    expect(out).toContain('tags: ["latency", "observability", "kubernetes"]');
    expect(out).not.toContain('astrology');
    expect(out).toContain('title: Cutting tail latency'); // other frontmatter untouched
  });

  it('inserts a tags line when the draft omitted one', () => {
    const md = ['---', 'title: Latency work', 'excerpt: e', 'category: guide', 'draft: true', '---', 'We cut latency and improved observability.'].join('\n');
    const out = reconcileTags(md, pack);
    expect(out).toMatch(/^---\n/);
    expect(out).toContain('tags: ["latency", "observability", "kubernetes"]');
  });

  it('leaves content without frontmatter unchanged', () => {
    const md = 'just a body, no frontmatter';
    expect(reconcileTags(md, pack)).toBe(md);
  });
});
