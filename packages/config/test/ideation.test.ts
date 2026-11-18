import { describe, expect, it } from 'vitest';
import {
  defaultAutonomousDraftingConfig,
  defaultBacklinksConfig,
  defaultDraftingConfig,
  defaultIdeationConfig,
  defaultRedditListeningConfig,
  defaultScoringConfig,
  domainPackSchema,
} from '../src/index.js';

const base = {
  brand: { name: 'Acme', siteUrl: 'https://acme.example' },
  authors: [{ slug: 'a', name: 'A', schemaId: 'https://acme.example/#a', profile: { name: 'A' } }],
  voice: { persona: 'p', bannedTopics: [], bannedPhrasings: [], rules: [], voiceAnchorUrls: [], readingGradeBand: [6, 9] },
  content: { categories: ['guide'], categoryTargets: { guide: 80 }, defaultAuthorSlug: 'a', timezone: 'UTC' },
  scoring: defaultScoringConfig,
  citation: { policy: 'direct-source-urls', forbiddenPatterns: [], referenceFormat: 'x', verifier: { kind: 'none' } },
  aeo: {
    brandMentions: ['Acme'],
    querySet: [{ id: 'q', query: 'acme widgets', tags: [] }],
    engines: ['perplexity'],
    highPriorityTags: [],
  },
  schema: { orgType: ['Organization'], org: { name: 'Acme', url: 'https://acme.example' }, articleTypes: ['Article'] },
  capabilities: {},
  services: { store: 'fs', requiredEnv: [] },
};

describe('ideation / listening / autonomous / backlinks pack fields', () => {
  it('are optional', () => {
    expect(domainPackSchema.safeParse(base).success).toBe(true);
  });

  it('accept the defaults and survive parsing (not stripped)', () => {
    const r = domainPackSchema.safeParse({
      ...base,
      capabilities: { ideation: true, listening: true },
      ideation: defaultIdeationConfig,
      listening: { reddit: { ...defaultRedditListeningConfig, brandTerms: ['acme'] } },
      drafting: {
        ...defaultDraftingConfig,
        autonomous: { ...defaultAutonomousDraftingConfig, source: 'cite8' },
        backlinks: defaultBacklinksConfig,
      },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.capabilities).toEqual({ ideation: true, listening: true });
    expect(r.data.drafting?.autonomous?.source).toBe('cite8');
    expect(r.data.drafting?.backlinks?.chunkSize).toBe(8);
    expect(r.data.listening?.reddit?.archivedAfterDays).toBe(175);
    expect(r.data.ideation?.transcriptMiner.maxChars).toBe(200_000);
  });

  it('defaults carry no domain values', () => {
    expect(defaultRedditListeningConfig.geoSubreddits).toEqual([]);
    expect(defaultRedditListeningConfig.brandTerms).toEqual([]);
    expect(defaultAutonomousDraftingConfig.source).toBe('none');
    expect(defaultAutonomousDraftingConfig.relevance.topics).toEqual([]);
  });
});
