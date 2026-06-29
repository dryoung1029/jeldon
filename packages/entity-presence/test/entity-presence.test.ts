import { describe, expect, it } from 'vitest';
import type { EntityPresenceConfig } from '@jeldon/config';
import {
  checkMentionConsistency,
  entityPresenceReport,
  perEngineCitationPatterns,
  StaticMentionProvider,
  type BrandContract,
  type OffSiteMention,
} from '../src/index.js';

const brand: BrandContract = {
  name: 'Acme Clinic',
  nap: { phone: '541-555-0100', address: '100 Main St' },
};

describe('checkMentionConsistency (default health pack)', () => {
  it('buckets mentions to sources and flags a NAP mismatch on a listing surface', () => {
    const mentions: OffSiteMention[] = [
      { url: 'https://reddit.com/r/x/comments/1', text: 'I go to Acme Clinic, great care' },
      { url: 'https://reddit.com/r/x/comments/2', text: 'second the Acme Clinic rec' },
      // Listicle surface with a STALE phone number -> mismatch.
      { url: 'https://yelp.com/biz/acme', text: 'Acme Clinic — call 541-555-9999' },
    ];
    const report = checkMentionConsistency(brand, mentions);

    const reddit = report.sources.find((s) => s.sourceId === 'reddit');
    expect(reddit?.mentionCount).toBe(2);
    // Reddit is a discussion surface — NAP not checked.
    expect(reddit?.napChecked).toBe(false);

    const listicle = report.sources.find((s) => s.sourceId === 'comparison-listicle');
    expect(listicle?.napChecked).toBe(true);
    const phone = listicle?.fields.find((f) => f.field === 'phone');
    expect(phone?.status).toBe('mismatch');
    expect(report.mismatchCount).toBeGreaterThanOrEqual(1);

    // Wikipedia was never mentioned -> a presence gap.
    expect(report.missingSources.map((m) => m.sourceId)).toContain('wikipedia');
  });
});

describe('perEngineCitationPatterns (default health pack)', () => {
  it('ranks Reddit top for Perplexity and Wikipedia top for OpenAI', () => {
    expect(perEngineCitationPatterns('perplexity').topSourceId).toBe('reddit');
    expect(perEngineCitationPatterns('openai').topSourceId).toBe('wikipedia');
  });

  it('returns an empty pattern for an unknown engine without throwing', () => {
    const p = perEngineCitationPatterns('gemini');
    expect(p.ranked).toEqual([]);
    expect(p.topSourceId).toBeNull();
  });
});

describe('entityPresenceReport', () => {
  it('produces presence-gap action items when no mentions exist (NullMentionProvider)', async () => {
    const report = await entityPresenceReport({
      brand: { name: 'Acme Clinic', siteUrl: 'https://acme.example' },
    });
    expect(report.hasData).toBe(false);
    // Every configured source is a gap -> a high-priority item for the
    // highest-weight surface (Reddit, weight 1.0).
    expect(report.actionItems.some((a) => a.sourceId === 'reddit' && a.priority === 'high')).toBe(
      true,
    );
    expect(report.enginePatterns.length).toBeGreaterThan(0);
  });

  it('surfaces real mentions through a StaticMentionProvider', async () => {
    const provider = new StaticMentionProvider([
      { url: 'https://reddit.com/r/x/1', text: 'Acme Clinic is solid' },
      { url: 'https://reddit.com/r/x/2', text: 'Acme Clinic again' },
      { url: 'https://reddit.com/r/x/3', text: 'third Acme Clinic mention' },
    ]);
    const report = await entityPresenceReport(
      { brand: { name: 'Acme Clinic', siteUrl: 'https://acme.example' } },
      { provider },
    );
    expect(report.hasData).toBe(true);
    const reddit = report.consistency.sources.find((s) => s.sourceId === 'reddit');
    expect(reddit?.established).toBe(true);
  });
});

describe('config-driven portability (no engine code changes)', () => {
  // A DevOps/security domain: the off-site surfaces that matter are GitHub,
  // Hacker News and Stack Overflow, and the engine affinities flip.
  const devopsCfg: EntityPresenceConfig = {
    sources: [
      { id: 'github', label: 'GitHub', hostNeedles: ['github.com'], weight: 1.0, napConsistencyChecked: false },
      { id: 'hn', label: 'Hacker News', hostNeedles: ['news.ycombinator.com'], weight: 0.9 },
      { id: 'stackoverflow', label: 'Stack Overflow', hostNeedles: ['stackoverflow.com'], weight: 0.8 },
    ],
    engineAffinities: [
      { engine: 'perplexity', affinity: { hn: 1.0, github: 0.7, stackoverflow: 0.6 } },
      { engine: 'anthropic', affinity: { github: 1.0, stackoverflow: 0.8, hn: 0.5 } },
    ],
    establishedThreshold: 2,
  };

  it('classifies GitHub mentions and ranks engines per the DevOps pack', () => {
    const mentions: OffSiteMention[] = [
      { url: 'https://github.com/acme/tool', text: 'Acme tool' },
      { url: 'https://news.ycombinator.com/item?id=1', text: 'Show HN: Acme' },
    ];
    const report = checkMentionConsistency({ name: 'Acme', nap: {} }, mentions, devopsCfg);
    expect(report.sources.map((s) => s.sourceId).sort()).toEqual(['github', 'hn']);
    // Same engine name, different pack -> different top source. No engine code changed.
    expect(perEngineCitationPatterns('anthropic', devopsCfg).topSourceId).toBe('github');
    expect(perEngineCitationPatterns('perplexity', devopsCfg).topSourceId).toBe('hn');
  });
});
