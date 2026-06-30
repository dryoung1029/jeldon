/**
 * GOLDEN EXAMPLE — a fully-filled, known-good Domain Pack for a NON-health
 * domain. This is the diff target an agent compares against when filling a new
 * project's `jeldon.config.ts`. It is committed as a CI fixture and must always
 * pass `jeldon validate`.
 *
 * "Northwatch" is a fictional DevOps/observability content site. Note what
 * changed from the source health system and what did NOT: no engine code
 * changed. Reading band 6-9 -> 9-12. Citation sources PubMed -> RFC/CVE/GitHub.
 * First-person markers "in our clinic" -> "in our cluster". Categories, weights,
 * query set, schema type all swapped. HIPAA stayed off. The engine never knew
 * it left healthcare.
 */
import { defineDomainPack, defaultScoringConfig } from '@jeldon/config';

export default defineDomainPack({
  brand: {
    name: 'Northwatch',
    siteUrl: 'https://northwatch.dev',
    tagline: 'Production observability, explained by people on call.',
    logoUrl: '/images/northwatch-mark.svg',
  },

  authors: [
    {
      slug: 'rae-okafor',
      name: 'Rae Okafor',
      title: 'Staff SRE',
      schemaId: 'https://northwatch.dev/#rae',
      isPrimary: true,
      profile: {
        name: 'Rae Okafor',
        jobTitle: 'Staff Site Reliability Engineer',
        knowsAbout: ['incident response', 'SLOs', 'distributed tracing', 'Kubernetes'],
        credential: '10 years on-call at hyperscale',
      },
    },
  ],

  voice: {
    persona: 'Direct, war-story-driven, first-person SRE. Dry. Zero vendor fluff.',
    bannedTopics: ['silver-bullet tooling', 'zero-downtime guarantees'],
    bannedPhrasings: ['industry-leading', 'seamlessly', 'studies have shown'],
    rules: ['Every claim about an outage pattern must cite a postmortem or RFC.'],
    voiceAnchorUrls: ['/articles/the-cardinality-explosion', '/articles/why-your-slo-is-lying'],
    readingGradeBand: [9, 12],
  },

  content: {
    categories: ['pattern', 'postmortem', 'tutorial', 'opinion'],
    categoryTargets: { tutorial: 85, pattern: 80, postmortem: 80, opinion: 72 },
    // Curated tag vocabulary — the generator draws 3–6 per article from here.
    tags: [
      'observability',
      'incident-response',
      'distributed-tracing',
      'reliability',
      'kubernetes',
      'latency',
      'on-call',
      'postmortems',
      'opentelemetry',
      'capacity-planning',
    ],
    defaultAuthorSlug: 'rae-okafor',
    timezone: 'America/New_York',
  },

  scoring: {
    geo: {
      floor: 68,
      checks: [
        {
          id: 'statistic',
          label: 'Statistic density',
          weight: 20,
          kind: 'regexPer1k',
          target: 'cleaned',
          patterns: ['(\\d+(?:\\.\\d+)?\\s*%|\\b\\d+\\s*[-\\u2013]\\s*\\d+\\b|\\b\\d{1,4}(?:[,.]\\d+)?\\b)'],
          flags: 'g',
          thresholds: [8, 4],
        },
        {
          id: 'quote',
          label: 'Attributed quotes',
          weight: 20,
          kind: 'regexCount',
          target: 'cleaned',
          patterns: ['"[^"]{20,300}"[\\s\\S]{0,80}?(?:per the postmortem|the RFC states|maintainers note|\\(\\d{4}\\))'],
          flags: 'gi',
          thresholds: [2, 1],
        },
        {
          // Citations are RFCs, GitHub issues, vendor docs, CVEs — NOT PubMed.
          id: 'citation',
          label: 'Citation density',
          weight: 20,
          kind: 'regexPer1k',
          target: 'body',
          patterns: ['datatracker\\.ietf\\.org', 'github\\.com/.+/issues', 'nvd\\.nist\\.gov', 'kubernetes\\.io/docs'],
          flags: 'gi',
          thresholds: [3, 1],
        },
        {
          id: 'firstPerson',
          label: 'First-person markers',
          weight: 15,
          kind: 'regexCount',
          target: 'cleaned',
          patterns: ['\\bwhen I was on call\\b|\\bwe paged at\\b|\\bin our cluster\\b|\\bI\\u2019ve debugged\\b|\\bwe ran\\b'],
          flags: 'gi',
          thresholds: [3, 1],
        },
        {
          id: 'questionH2',
          label: 'Question H2s',
          weight: 15,
          kind: 'questionH2',
          patterns: ['what', 'why', 'how', 'when', 'should', 'can'],
          thresholds: [2, 1],
        },
        {
          id: 'authority',
          label: 'Authority markers',
          weight: 10,
          kind: 'regexCount',
          target: 'cleaned',
          patterns: ['\\bRFC \\d+\\b|\\bCVE-\\d', '\\bSRE book\\b', "\\bGoogle\\u2019s\\b", '\\bmaintainer\\b'],
          flags: 'g',
          thresholds: [2, 1],
        },
      ],
    },
    seo: {
      ...defaultScoringConfig.seo,
      wordCount: { good: [1000, 3000], mehMin: 600 },
      reading: { good: [9, 12], mehMax: 13 },
      internalLinkPrefixes: ['articles', 'guides', 'patterns'],
      referenceSectionNames: ['references', 'further reading', 'sources'],
      evidenceTriggers: ['benchmark', 'postmortem', 'incident', 'RFC', 'CVE', 'SLO'],
    },
  },

  citation: {
    policy: 'direct-source-urls',
    forbiddenPatterns: ['RFC ?9{4,}'], // impossible RFC numbers — fabrication guard
    referenceFormat: 'Title, source. [link](URL)',
    verifier: { kind: 'primary-source' }, // generic resolvable-link verifier, NOT cite8
  },

  aeo: {
    brandMentions: ['northwatch', 'rae okafor'],
    localSearchLocation: undefined, // not a local business → no geo-biased SERP
    querySet: [
      { id: 'trace-sampling', query: 'best distributed tracing sampling strategy', tags: ['pattern', 'discovery'] },
      { id: 'slo-burn', query: 'how to set SLO burn rate alerts', tags: ['tutorial'] },
      { id: 'cardinality', query: 'reduce prometheus cardinality', tags: ['pattern'] },
    ],
    engines: ['perplexity', 'anthropic', 'openai'],
    highPriorityTags: ['discovery', 'tutorial'],
  },

  schema: {
    orgType: ['Organization'],
    org: { name: 'Northwatch', url: 'https://northwatch.dev' },
    articleTypes: ['TechArticle'], // NOT MedicalWebPage
    emitLlmsTxt: false,
  },

  compliance: { pack: 'none' }, // no HIPAA — opt-in stays off

  capabilities: {
    drafting: true,
    amplify: true,
    competitiveIntel: false,
    audio: false,
    heroImages: true,
    engagementAnalytics: true,
    entityPresence: false,
  },

  services: {
    store: 'github',
    analytics: 'cloudflare',
    requiredEnv: ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'PERPLEXITY_API_KEY'],
  },
});
