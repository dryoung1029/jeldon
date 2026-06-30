import { z } from 'zod';

const tuple2 = z.tuple([z.number(), z.number()]);

const orgProfile = z.object({
  name: z.string(),
  url: z.string().url(),
  logoUrl: z.string().optional(),
  sameAs: z.array(z.string()).optional(),
  extra: z.record(z.unknown()).optional(),
});

const personProfile = z.object({
  name: z.string(),
  jobTitle: z.string().optional(),
  url: z.string().optional(),
  image: z.string().optional(),
  knowsAbout: z.array(z.string()).optional(),
  credential: z.string().optional(),
  alumniOf: z.array(z.string()).optional(),
  memberOf: z.array(z.string()).optional(),
  awards: z.array(z.string()).optional(),
  sameAs: z.array(z.string()).optional(),
  extra: z.record(z.unknown()).optional(),
});

const geoCheck = z.object({
  id: z.string(),
  label: z.string(),
  weight: z.number().nonnegative(),
  kind: z.enum(['regexCount', 'regexPer1k', 'questionH2']),
  patterns: z.array(z.string()).optional(),
  flags: z.string().optional(),
  target: z.enum(['cleaned', 'body']).optional(),
  thresholds: tuple2,
});

const geoConfig = z.object({
  floor: z.number().min(0).max(100),
  checks: z.array(geoCheck).min(1),
});

const seoConfig = z.object({
  title: z.object({ good: tuple2, mehMax: z.number() }),
  excerpt: z.object({ good: tuple2, meh: tuple2 }),
  slugMaxLen: z.number().int().positive(),
  wordCount: z.object({ good: tuple2, mehMin: z.number() }),
  bodyChars: z.object({ good: z.number().int().positive(), meh: z.number().int().positive() }),
  h2: z.object({ good: tuple2, meh: tuple2 }),
  internalLinks: z.object({ good: z.number().int().nonnegative(), meh: z.number().int().nonnegative() }),
  tags: z.object({ good: tuple2, mehMin: z.number() }),
  heroAltWords: z.object({ good: tuple2 }),
  reading: z.object({ good: tuple2, mehMax: z.number() }),
  internalLinkPrefixes: z.array(z.string()).min(1),
  referenceSectionNames: z.array(z.string()).min(1),
  evidenceTriggers: z.array(z.string()),
  badFilenameRe: z.string(),
});

const citationConfig = z.object({
  policy: z.enum(['direct-source-urls', 'search-urls-only', 'verifier-required']),
  forbiddenPatterns: z.array(z.string()),
  referenceFormat: z.string(),
  verifier: z.object({
    kind: z.enum(['none', 'cite8', 'primary-source']),
    baseUrl: z.string().optional(),
  }),
});

const aeoConfig = z.object({
  brandMentions: z.array(z.string()).min(1),
  localSearchLocation: z.string().optional(),
  querySet: z
    .array(z.object({ id: z.string(), query: z.string(), tags: z.array(z.string()) }))
    .min(1),
  engines: z.array(z.enum(['perplexity', 'anthropic', 'google-aio', 'openai'])).min(1),
  highPriorityTags: z.array(z.string()),
  maxSnapshots: z.number().int().positive().optional(),
});

const strategyConfig = z.object({
  thresholds: z.object({
    real404MinRequests: z.number().int().nonnegative(),
    real404HighRequests: z.number().int().nonnegative(),
    serverError5xxMin: z.number().int().nonnegative(),
    serverError5xxHigh: z.number().int().nonnegative(),
    topContentPaths: z.number().int().positive(),
    geoHighTopRank: z.number().int().positive(),
    geoTargetMargin: z.number().nonnegative(),
    audioTopRank: z.number().int().positive(),
    socialMinReferrers: z.number().int().nonnegative(),
    socialGapFraction: z.number().min(0).max(1),
    socialGapFloor: z.number().nonnegative(),
    climbRankRange: tuple2,
    climbMax: z.number().int().nonnegative(),
    maxRecommendations: z.number().int().positive(),
  }),
  siteRoute404Patterns: z.array(z.string()).min(1),
  articlePathPattern: z.string(),
  refererGroups: z.object({
    social: z.array(z.string()),
    search: z.array(z.string()),
  }),
  liveCrawlPurpose: z.string(),
  deepLinks: z.record(z.object({ link: z.string(), linkLabel: z.string().optional() })),
  copy: z.record(z.object({ title: z.string(), evidence: z.string() })),
});

const competitorsConfig = z.object({
  ourPlaceId: z.string().optional(),
  ourName: z.string().optional(),
  localPackLocation: z.string().optional(),
  roster: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      placeId: z.string().optional(),
      targetKeywords: z.array(z.string()).optional(),
    }),
  ),
  targetKeywords: z.array(z.string()),
  highValuePatterns: z.array(z.string()).optional(),
  skipPatterns: z.array(z.string()).optional(),
  templateVendors: z
    .array(z.object({ name: z.string(), fingerprints: z.array(z.string()) }))
    .optional(),
});

const draftingConfig = z.object({
  models: z.record(z.string()),
  defaultModel: z.string(),
  utilityModel: z.string(),
  draftFloor: z.object({ seo: z.number(), geo: z.number() }),
  wordCountTarget: tuple2,
  bodyCharCeiling: z.number().int().positive(),
  maxTokens: z.object({
    brainstorm: z.number().int().positive(),
    draft: z.number().int().positive(),
    outline: z.number().int().positive(),
    'draft-series': z.number().int().positive(),
    'draft-series-article': z.number().int().positive(),
    fixPass: z.number().int().positive(),
    extractClaims: z.number().int().positive(),
    chat: z.number().int().positive(),
  }),
  promptOverrides: z.record(z.string()).optional(),
});

const amplifyConfig = z.object({
  channels: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        guidance: z.string(),
        fieldDescription: z.string(),
        utm: z.string().optional(),
        noUrl: z.boolean().optional(),
      }),
    )
    .min(1),
  systemPreamble: z.string(),
  carouselSchemes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        bg: z.string(),
        fg: z.string(),
        accent: z.string(),
      }),
    )
    .min(1),
  carouselGuidance: z.string(),
  newsletterGuidance: z.string(),
  carouselStateDir: z.string().optional(),
});

const mediaConfig = z.object({
  narration: z.object({
    voiceId: z.string(),
    model: z.string(),
    voiceSettings: z.object({
      stability: z.number(),
      similarity_boost: z.number(),
      style: z.number(),
      use_speaker_boost: z.boolean(),
    }),
    outroText: z.string(),
    pronunciationOverrides: z.array(z.object({ word: z.string(), ipa: z.string() })),
    abbreviationExpansions: z.array(z.object({ abbr: z.string(), full: z.string() })),
    chunkChars: z.number().int().positive(),
    maxChars: z.number().int().positive(),
    referenceSectionNames: z.array(z.string()),
  }),
  heroImage: z.object({
    model: z.string(),
    size: z.string(),
    quality: z.string(),
    promptTemplate: z.string(),
    proposalSystem: z.string(),
  }),
  podcast: z.object({
    title: z.string(),
    subtitle: z.string(),
    description: z.string(),
    author: z.string(),
    ownerEmail: z.string(),
    category: z.string(),
    subcategory: z.string().optional(),
    copyright: z.string().optional(),
    language: z.string().optional(),
    coverImage: z.string(),
    charsPerMinute: z.number().positive().optional(),
    trailer: z
      .object({
        title: z.string(),
        audioPath: z.string(),
        audioSize: z.number().int().nonnegative(),
        duration: z.string(),
        pubDate: z.string(),
        summary: z.string(),
      })
      .optional(),
  }),
});

const analyticsConfig = z.object({
  aiBotList: z
    .array(
      z.object({
        match: z.string(),
        bot: z.string(),
        engine: z.string(),
        purpose: z.enum(['train', 'index', 'live']),
      }),
    )
    .min(1),
  refererChannelMap: z.array(
    z.object({
      label: z.string().optional(),
      needles: z.array(z.string()),
      drop: z.boolean().optional(),
    }),
  ),
  directLabel: z.string(),
  articlePathPattern: z.string(),
  assetPathPattern: z.string(),
  botUaPattern: z.string(),
  siteRoute404Patterns: z.array(z.string()),
  cloudflare: z
    .object({
      zoneId: z.string().optional(),
      accountId: z.string().optional(),
      endpoint: z.string().optional(),
    })
    .optional(),
  windowDays: z.number().int().positive(),
  maxDailySnapshots: z.number().int().positive(),
});

const entityPresenceConfig = z.object({
  sources: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        hostNeedles: z.array(z.string()),
        weight: z.number().min(0).max(1),
        napConsistencyChecked: z.boolean().optional(),
      }),
    )
    .min(1),
  engineAffinities: z.array(
    z.object({
      engine: z.string(),
      affinity: z.record(z.number().min(0).max(1)),
      note: z.string().optional(),
    }),
  ),
  consistencyTargets: z
    .object({
      name: z.string().optional(),
      nap: z.record(z.string()),
    })
    .optional(),
  establishedThreshold: z.number().int().positive().optional(),
});

export const domainPackSchema = z
  .object({
    brand: z.object({
      name: z.string().min(1),
      siteUrl: z.string().url(),
      tagline: z.string().optional(),
      geoFraming: z.string().optional(),
      nap: z
        .object({
          address: z.string().optional(),
          city: z.string().optional(),
          region: z.string().optional(),
          postalCode: z.string().optional(),
          phone: z.string().optional(),
          placeId: z.string().optional(),
        })
        .optional(),
      logoUrl: z.string().optional(),
      brandColors: z.record(z.string()).optional(),
    }),
    authors: z
      .array(
        z.object({
          slug: z.string(),
          name: z.string(),
          title: z.string().optional(),
          schemaId: z.string(),
          profile: personProfile,
          isPrimary: z.boolean().optional(),
        }),
      )
      .min(1),
    voice: z.object({
      persona: z.string().min(1),
      bannedTopics: z.array(z.string()),
      bannedPhrasings: z.array(z.string()),
      rules: z.array(z.string()),
      voiceAnchorUrls: z.array(z.string()),
      readingGradeBand: tuple2,
    }),
    content: z.object({
      categories: z.array(z.string()).min(1),
      categoryTargets: z.record(z.number().min(0).max(100)),
      tags: z.array(z.string()).optional(),
      defaultAuthorSlug: z.string(),
      timezone: z.string(),
      lifecycle: z.object({ docReviewed: z.boolean().optional() }).optional(),
    }),
    scoring: z.object({ geo: geoConfig, seo: seoConfig }),
    citation: citationConfig,
    aeo: aeoConfig,
    competitors: competitorsConfig.optional(),
    strategy: strategyConfig.optional(),
    drafting: draftingConfig.optional(),
    amplify: amplifyConfig.optional(),
    media: mediaConfig.optional(),
    analytics: analyticsConfig.optional(),
    entityPresence: entityPresenceConfig.optional(),
    schema: z.object({
      orgType: z.array(z.string()).min(1),
      org: orgProfile,
      articleTypes: z.array(z.string()).min(1),
      publishingPrinciplesUrl: z.string().optional(),
      articleGraph: z
        .object({
          reviewerSchemaId: z.string().optional(),
          emitLastReviewed: z.boolean().optional(),
          publishingPrinciplesUrl: z.string().optional(),
          heroImageDimensions: z
            .object({ width: z.number().int().positive(), height: z.number().int().positive() })
            .optional(),
          sourceEpisodeSeriesName: z.string().optional(),
        })
        .optional(),
      emitLlmsTxt: z.boolean().optional(),
      llmsTxt: z
        .object({
          summary: z.string().optional(),
          intro: z.string().optional(),
          sections: z
            .array(
              z.object({
                heading: z.string(),
                items: z.array(
                  z.union([
                    z.string(),
                    z.object({
                      label: z.string(),
                      url: z.string().optional(),
                      note: z.string().optional(),
                    }),
                  ]),
                ),
              }),
            )
            .optional(),
        })
        .optional(),
    }),
    compliance: z
      .object({
        pack: z.string(),
        reviewResponseRules: z.array(z.string()).optional(),
        requireHumanReviewTags: z.array(z.string()).optional(),
      })
      .optional(),
    capabilities: z.object({
      drafting: z.boolean().optional(),
      amplify: z.boolean().optional(),
      audio: z.boolean().optional(),
      heroImages: z.boolean().optional(),
      competitiveIntel: z.boolean().optional(),
      engagementAnalytics: z.boolean().optional(),
      entityPresence: z.boolean().optional(),
    }),
    services: z.object({
      store: z.enum(['github', 'fs']),
      contentDir: z.string().optional(),
      analytics: z.enum(['cloudflare', 'none']).optional(),
      requiredEnv: z.array(z.string()),
    }),
  })
  .superRefine((pack, ctx) => {
    // Cross-field invariants the engine relies on. These are the same checks
    // `jeldon doctor` surfaces, enforced here so an invalid pack can't load.
    const targets = Object.values(pack.content.categoryTargets);
    if (targets.length) {
      const minTarget = Math.min(...targets);
      if (pack.scoring.geo.floor > minTarget) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scoring', 'geo', 'floor'],
          message: `GEO floor (${pack.scoring.geo.floor}) must be <= the lowest category target (${minTarget}).`,
        });
      }
    }
    for (const cat of Object.keys(pack.content.categoryTargets)) {
      if (!pack.content.categories.includes(cat)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'categoryTargets', cat],
          message: `categoryTargets references "${cat}" which is not in content.categories.`,
        });
      }
    }
    if (!pack.authors.some((a) => a.slug === pack.content.defaultAuthorSlug)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content', 'defaultAuthorSlug'],
        message: `defaultAuthorSlug "${pack.content.defaultAuthorSlug}" matches no author slug.`,
      });
    }
  });

export type DomainPackInput = z.input<typeof domainPackSchema>;
