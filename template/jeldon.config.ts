/**
 * YOUR DOMAIN PACK — the only file you edit to specialize the Jeldon engine.
 *
 * This starter is valid out of the box (so `jeldon validate` is green from
 * clone), but every value is a PLACEHOLDER. Replace them with your project's
 * real identity, voice, taxonomy, and sources. Diff against
 * `examples/jeldon.config.example.ts` (the golden Northwatch config) for a
 * fully-filled non-health reference, and read `docs/DOMAIN-PACK.md` for the
 * field-by-field guide.
 *
 * Most domains only need to override, under `scoring.geo.checks`:
 *   - the `citation` check's `patterns` → your real primary sources
 *   - the `firstPerson` check's `patterns` → how your experts speak
 *   - and `voice.readingGradeBand` / `scoring.seo.reading`
 */
import { defineDomainPack, defaultScoringConfig } from '@jeldon/config';

export default defineDomainPack({
  brand: {
    name: 'TODO Project Name',
    siteUrl: 'https://example.com', // TODO your canonical host
    tagline: 'TODO one-line positioning',
  },

  authors: [
    {
      slug: 'primary-author',
      name: 'TODO Author Name',
      title: 'TODO Title',
      schemaId: 'https://example.com/#author',
      isPrimary: true,
      profile: {
        name: 'TODO Author Name',
        knowsAbout: ['TODO topic one', 'TODO topic two'],
      },
    },
  ],

  voice: {
    persona: 'TODO Direct, first-person, evidence-informed. Describe the tone.',
    bannedTopics: [],
    bannedPhrasings: ['studies have shown'],
    rules: [],
    voiceAnchorUrls: [], // add 1-2 canonical articles once you have them
    readingGradeBand: [6, 9],
  },

  content: {
    categories: ['guide', 'evidence', 'opinion'],
    categoryTargets: { guide: 85, evidence: 85, opinion: 75 },
    defaultAuthorSlug: 'primary-author',
    timezone: 'America/Los_Angeles',
  },

  // Start from the proven defaults; override the citation/firstPerson patterns
  // and reading band for your domain.
  scoring: defaultScoringConfig,

  citation: {
    policy: 'direct-source-urls',
    forbiddenPatterns: [],
    referenceFormat: 'Author, year. Description. [link](URL)',
    verifier: { kind: 'none' }, // 'primary-source' for generic link-resolution; 'cite8' for biomedical
  },

  aeo: {
    brandMentions: ['todo-brand'],
    querySet: [
      { id: 'q1', query: 'TODO a real query your audience asks', tags: ['discovery'] },
      { id: 'q2', query: 'TODO another query', tags: ['education'] },
      { id: 'q3', query: 'TODO a third query', tags: ['comparison'] },
    ],
    engines: ['perplexity', 'anthropic'],
    highPriorityTags: ['discovery'],
  },

  schema: {
    orgType: ['Organization'],
    org: { name: 'TODO Project Name', url: 'https://example.com' },
    articleTypes: ['Article'],
    emitLlmsTxt: false,
  },

  compliance: { pack: 'none' },

  capabilities: {
    drafting: true,
    amplify: false,
    audio: false,
    heroImages: false,
    competitiveIntel: false,
    engagementAnalytics: false,
    entityPresence: false,
  },

  services: {
    store: 'github',
    analytics: 'none',
    requiredEnv: ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY'],
  },
});
