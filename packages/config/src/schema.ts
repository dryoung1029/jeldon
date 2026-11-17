import { z } from 'zod';

const tuple2 = z.tuple([z.number(), z.number()]);

const orgProfile = z.object({
  name: z.string(),
  url: z.url(),
  logoUrl: z.string().optional(),
  sameAs: z.array(z.string()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
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
  extra: z.record(z.string(), z.unknown()).optional(),
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
  staticPages: z.object({ roots: z.array(z.string()).optional(), exclude: z.array(z.string()).optional() }).optional(),
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
  brandMentionExclusions: z.record(z.string(), z.array(z.string())).optional(),
  model: z.string().optional(),
  citations: z
    .object({ topN: z.number().int().positive(), directoryHosts: z.array(z.string()), listUrlPattern: z.string().min(1) })
    .optional(),
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
  deepLinks: z.record(z.string(), z.object({ link: z.string(), linkLabel: z.string().optional() })),
  copy: z.record(z.string(), z.object({ title: z.string(), evidence: z.string() })),
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

// --- Ideation, listening, autonomous drafting, backlinks ---------------------

const autonomousDraftingConfig = z.object({
  source: z.string(),
  maxDraftsPerRun: z.number().int().min(0),
  digestDays: z.number().int().positive(),
  relevance: z.object({
    topics: z.array(z.string()),
    requireTopic: z.boolean(),
    requirePriorityKeyword: z.boolean(),
  }),
  category: z.string().optional(),
  coverageTitleChars: z.number().int().positive(),
  promptTemplate: z.string().optional(),
});

const backlinksConfig = z.object({
  chunkSize: z.number().int().positive(),
  internalPathPrefix: z.string().min(1),
  maxTokens: z.number().int().positive(),
  minAnchorChars: z.number().int().positive(),
  model: z.string().optional(),
});

const ideationConfig = z.object({
  transcriptMiner: z.object({
    maxChars: z.number().int().positive(),
    minChars: z.number().int().min(0),
    publishedSourceNoun: z.string().min(1),
    listenCalloutLabel: z.string().min(1),
    maxProposals: z.object({
      published: z.number().int().positive(),
      private: z.number().int().positive(),
    }),
    privateSourceGuidance: z.string().optional(),
    publishedSourceGuidance: z.string().optional(),
    anchorEverySeconds: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
    model: z.string().optional(),
  }),
  backlog: z.object({ path: z.string().min(1) }),
});

const listeningConfig = z.object({
  reddit: z
    .object({
      geoSubreddits: z.array(z.string()),
      conditionSubreddits: z.array(z.string()),
      brandTerms: z.array(z.string()),
      genericPhraseExclusions: z.record(z.string(), z.array(z.string())).optional(),
      serviceKeywords: z.array(z.string()),
      targetSearches: z.array(z.object({ sub: z.string(), query: z.string() })),
      retentionDays: z.number().int().positive(),
      maxItems: z.number().int().positive(),
      archivedAfterDays: z.number().int().positive(),
      staleAfterDays: z.number().int().positive(),
      stalePenalty: z.number(),
      recency: z.array(z.object({ maxDays: z.number(), bonus: z.number(), label: z.string() })),
      competitorMinNameLength: z.number().int().min(0),
      maxTargets: z.number().int().positive(),
      userAgent: z.string().min(1),
      requestDelayMs: z.number().int().min(0),
      rssRetryMs: z.number().int().min(0),
      retryBudgetMs: z.number().int().min(0),
      maxRssRetries: z.number().int().min(0),
      model: z.string().optional(),
      maxTokens: z.number().int().positive(),
    })
    .optional(),
});

const draftingConfig = z.object({
  models: z.record(z.string(), z.string()),
  defaultModel: z.string(),
  modelLabels: z.record(z.string(), z.string()).optional(),
  effort: z.record(z.string(), z.enum(['low', 'medium', 'high', 'max'])).optional(),
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
  promptOverrides: z.record(z.string(), z.string()).optional(),
  autonomous: autonomousDraftingConfig.optional(),
  backlinks: backlinksConfig.optional(),
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
  newsletterGuidance: z.string(),
  ctaPolicy: z
    .object({ channels: z.array(z.string()), allowed: z.array(z.string()), banned: z.array(z.string()) })
    .optional(),
  carouselStudio: z
    .object({
      baseUrl: z.string().url(),
      brandId: z.string().min(1),
      projectIdPrefix: z.string().min(1),
      schemeName: z.string().optional(),
      clientIdEnv: z.string().min(1),
      clientSecretEnv: z.string().min(1),
      timeoutMs: z.number().int().positive().optional(),
    })
    .optional(),
  newsletter: z
    .object({ sendHour: z.number().int().min(0).max(23).optional(), floorHours: z.number().nonnegative().optional() })
    .optional(),
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
    z
      .object({
        label: z.string().optional(),
        hosts: z.array(z.string()).optional(),
        hostPatterns: z.array(z.string()).optional(),
        utmSources: z.array(z.string()).optional(),
        hostContains: z.array(z.string()).optional(),
        drop: z.boolean().optional(),
        needles: z.unknown().optional(),
      })
      .superRefine((rule, ctx) => {
        if (rule.needles !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['needles'],
            message:
              'refererChannelMap `needles` (substring match) was removed: it misclassified hosts (`t.co` matched reddit.com). Use `hosts` (exact or subdomain), `hostPatterns` (anchored regex) or `utmSources` (exact tokens).',
          });
        }
        if (!rule.hosts?.length && !rule.hostPatterns?.length && !rule.utmSources?.length && !rule.hostContains?.length) {
          ctx.addIssue({ code: 'custom', message: 'A referer rule needs at least one of hosts, hostPatterns, utmSources or hostContains.' });
        }
      }),
  ),
  ownHosts: z.array(z.string()).optional(),
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
  sitePath: z.object({ excludePrefixes: z.array(z.string()), maxLength: z.number().int().positive() }).optional(),
  webVitals: z
    .object({ typeName: z.string().min(1), dataset: z.string().min(1), days: z.number().int().positive() })
    .optional(),
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
      affinity: z.record(z.string(), z.number().min(0).max(1)),
      note: z.string().optional(),
    }),
  ),
  consistencyTargets: z
    .object({
      name: z.string().optional(),
      nap: z.record(z.string(), z.string()),
    })
    .optional(),
  establishedThreshold: z.number().int().positive().optional(),
});

// Ops observability (@jeldon/ops)
const opsConfig = z
  .object({
    pipelines: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        file: z.string().min(1),
        source: z.string(),
        cadenceDays: z.number().positive(),
        timestampField: z.string().min(1),
        changeGated: z
          .object({
            checkedAtField: z.string().min(1).optional(),
            checkCadenceDays: z.number().positive(),
          })
          .optional(),
        run: z
          .discriminatedUnion('kind', [
            z.object({ kind: z.literal('workflow'), workflow: z.string().min(1) }),
            z.object({ kind: z.literal('endpoint'), href: z.string().min(1) }),
            z.object({ kind: z.literal('page'), href: z.string().min(1), label: z.string() }),
          ])
          .optional(),
      }),
    ),
    grading: z.object({
      lateMultiplier: z.number().positive(),
      staleMultiplier: z.number().positive(),
    }),
    cadence: z.object({
      articleDays: z.number().int().min(1).max(365),
      newsletterDays: z.number().int().min(1).max(365).optional(),
      newsletterStuckDays: z.number().min(0).optional(),
    }),
    dispatch: z
      .object({
        allowlist: z.array(z.string().regex(/^[\w.-]+\.ya?ml$/, 'workflow file name, e.g. fetch-data.yml')),
        pollSeconds: z.number().positive().optional(),
        timeoutMinutes: z.number().positive().optional(),
        createdAtSlackSeconds: z.number().min(0).optional(),
      })
      .optional(),
    links: z.record(z.string(), z.object({ href: z.string(), label: z.string() })).optional(),
  })
  .superRefine((ops, ctx) => {
    if (ops.grading.staleMultiplier < ops.grading.lateMultiplier) {
      ctx.addIssue({
        code: 'custom',
        path: ['grading', 'staleMultiplier'],
        message: `staleMultiplier (${ops.grading.staleMultiplier}) must be >= lateMultiplier (${ops.grading.lateMultiplier}).`,
      });
    }
    const seen = new Set<string>();
    ops.pipelines.forEach((p, i) => {
      if (seen.has(p.id)) {
        ctx.addIssue({ code: 'custom', path: ['pipelines', i, 'id'], message: `duplicate pipeline id "${p.id}".` });
      }
      seen.add(p.id);
      if (p.run?.kind === 'workflow' && !(ops.dispatch?.allowlist ?? []).includes(p.run.workflow)) {
        ctx.addIssue({
          code: 'custom',
          path: ['pipelines', i, 'run', 'workflow'],
          message: `pipeline "${p.id}" runs "${p.run.workflow}", which is not in ops.dispatch.allowlist.`,
        });
      }
    });
  });

const searchConsoleConfig = z.object({
  propertyEnv: z.string().min(1),
  saKeyEnv: z.string().min(1),
  property: z.string().optional(),
  rangeDays: z.number().int().positive(),
  lagDays: z.number().int().nonnegative(),
  rowLimit: z.number().int().positive().max(25000),
  snapshotPath: z.string().min(1),
  strikingDistance: z.object({
    minPosition: z.number().positive(),
    maxPosition: z.number().positive(),
    minImpressions: z.number().nonnegative(),
    limit: z.number().int().positive(),
  }),
  lowCtr: z.object({
    maxPosition: z.number().positive(),
    minImpressions: z.number().nonnegative(),
    ratio: z.number().positive(),
    expectedCtrCurve: z.array(z.number().min(0).max(1)).min(1),
    limit: z.number().int().positive(),
  }),
  snippetLab: z
    .object({
      logPath: z.string().min(1),
      maxEntries: z.number().int().positive(),
    })
    .optional(),
});

// --- Leads + conversion (@jeldon/leads) -------------------------------------
const mailboxRule = z.object({ id: z.string().min(1), pattern: z.string().min(1) });
const leadsConfig = z.object({
  attribution: z.object({
    storagePrefix: z.string().min(1),
    utmKeys: z.array(z.string()),
    maxLandingChars: z.number().int().positive(),
    maxReferrerChars: z.number().int().positive(),
    maxUtmChars: z.number().int().positive(),
    capturePhoneTaps: z.boolean().optional(),
  }),
  unknownChannelLabel: z.string().min(1),
  requestVia: z.array(z.string()),
  bookingImport: z.object({
    presets: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string(),
          columns: z.object({
            email: z.array(z.string()),
            phone: z.array(z.string()),
            date: z.array(z.string()),
          }),
        }),
      )
      .min(1),
    defaultPreset: z.string().min(1),
    phoneDigits: z.number().int().min(7).max(15),
    maxRows: z.number().int().positive(),
  }),
  trends: z.object({ defaultBucket: z.enum(['week', 'month']) }),
});
const requestContext = z.object({
  topic: z.string(),
  visitType: z.string(),
  headline: z.string(),
  sub: z.string(),
});
const conversionConfig = z.object({
  minLeads: z.number().int().min(1),
  requestContexts: z
    .object({ default: requestContext, byCluster: z.record(z.string(), requestContext.partial()) })
    .optional(),
});
const mailboxComplianceConfig = z.object({
  enabled: z.boolean(),
  address: z.string().optional(),
  notificationWindowMinutes: z.number().positive(),
  autoReplyUnderMinutes: z.number().min(0),
  rules: z
    .object({
      phoneFromUs: z.array(mailboxRule),
      phoneFromThem: z.array(mailboxRule),
      decline: z.array(mailboxRule),
      declineReasons: z.array(z.object({ reason: z.string().min(1), label: z.string(), rules: z.array(mailboxRule) })),
      unspecifiedLabel: z.string(),
      bookedInThread: z.array(mailboxRule),
    })
    .optional(),
});

// --- Site ops: site alert, admin access, business hours -------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM (24-hour)');
const hoursInterval = z.object({ opens: hhmm, closes: hhmm });
const dayName = z.enum(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const specialHours = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  intervals: z.array(hoursInterval),
  label: z.string().optional(),
  source: z.literal('google').optional(),
});
const brandContact = z.object({
  email: z.email(),
  phoneDisplay: z.string().optional(),
});
const businessHoursConfig = z.object({
  regular: z.array(z.object({ day: dayName, intervals: z.array(hoursInterval) })),
  special: z.array(specialHours).optional(),
  dataFile: z.string().optional(),
});
const placesServiceConfig = z.object({
  apiKeyEnv: z.string().min(1),
  placeIdEnv: z.string().min(1),
});
const siteAlertConfig = z.object({
  limits: z.object({
    label: z.number().int().positive(),
    title: z.number().int().positive(),
    message: z.number().int().positive(),
    maxDays: z.number().int().positive(),
  }),
  presets: z
    .record(
      z.string(),
      z.object({
        name: z.string().min(1),
        title: z.string().min(1),
        message: z.string(),
        label: z.string().optional(),
        messageButton: z.boolean().optional(),
        emailButton: z.boolean().optional(),
        phonesDown: z.boolean().optional(),
      }),
    )
    .optional(),
  pollTimeoutMinutes: z.number().positive(),
  pollIntervalSeconds: z.number().positive().optional(),
  dataFile: z.string().optional(),
  storageKeyPrefix: z.string().min(1).optional(),
  messageHref: z.string().optional(),
  labels: z
    .object({
      message: z.string().optional(),
      email: z.string().optional(),
      dismiss: z.string().optional(),
      close: z.string().optional(),
    })
    .optional(),
});
const securityConfig = z.object({
  adminPrefixes: z.array(z.string().regex(/^\/[^\s]*$/, 'a path prefix starting with "/"')),
  access: z
    .object({
      teamDomain: z.string().min(1),
      aud: z.string().min(1),
    })
    .optional(),
});

export const domainPackSchema = z
  .object({
    brand: z.object({
      name: z.string().min(1),
      siteUrl: z.url(),
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
      brandColors: z.record(z.string(), z.string()).optional(),
      contact: brandContact.optional(),
      hours: businessHoursConfig.optional(),
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
      categoryTargets: z.record(z.string(), z.number().min(0).max(100)),
      tags: z.array(z.string()).optional(),
      defaultAuthorSlug: z.string(),
      timezone: z.string(),
      lifecycle: z.object({ docReviewed: z.boolean().optional() }).optional(),
      heroImagePathPrefixes: z.array(z.string().min(1)).optional(),
      topicClusters: z
        .object({
          pathPrefix: z.string().optional(),
          minLiveArticles: z.number().int().positive().optional(),
          clusters: z
            .array(
              z.object({
                id: z.string().regex(/^[a-z0-9-]+$/, 'cluster id must be lowercase letters, digits and hyphens'),
                label: z.string().min(1),
                title: z.string().min(1),
                description: z.string().min(1),
                lead: z.string().optional(),
                tags: z.array(z.string()),
                series: z.array(z.string()).optional(),
                slugHints: z.array(z.string()).optional(),
              }),
            )
            .superRefine((cs, ctx) => {
              const seen = new Set<string>();
              cs.forEach((c, i) => {
                if (seen.has(c.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate cluster id "${c.id}"` });
                seen.add(c.id);
              });
            }),
        })
        .optional(),
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
    ops: opsConfig.optional(),
    searchConsole: searchConsoleConfig.optional(),
    leads: leadsConfig.optional(),
    conversion: conversionConfig.optional(),
    ideation: ideationConfig.optional(),
    listening: listeningConfig.optional(),
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
        mailbox: mailboxComplianceConfig.optional(),
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
      ops: z.boolean().optional(),
      searchConsole: z.boolean().optional(),
      leads: z.boolean().optional(),
      conversionMap: z.boolean().optional(),
      siteAlert: z.boolean().optional(),
      businessHours: z.boolean().optional(),
      ideation: z.boolean().optional(),
      listening: z.boolean().optional(),
    }),
    services: z.object({
      store: z.enum(['github', 'fs']),
      contentDir: z.string().optional(),
      analytics: z.enum(['cloudflare', 'none']).optional(),
      requiredEnv: z.array(z.string()),
      places: placesServiceConfig.optional(),
    }),
    siteAlert: siteAlertConfig.optional(),
    security: securityConfig.optional(),
  })
  .superRefine((pack, ctx) => {
    // Cross-field invariants the engine relies on. These are the same checks
    // `jeldon doctor` surfaces, enforced here so an invalid pack can't load.
    const targets = Object.values(pack.content.categoryTargets);
    if (targets.length) {
      const minTarget = Math.min(...targets);
      if (pack.scoring.geo.floor > minTarget) {
        ctx.addIssue({
          code: 'custom',
          path: ['scoring', 'geo', 'floor'],
          message: `GEO floor (${pack.scoring.geo.floor}) must be <= the lowest category target (${minTarget}).`,
        });
      }
    }
    for (const cat of Object.keys(pack.content.categoryTargets)) {
      if (!pack.content.categories.includes(cat)) {
        ctx.addIssue({
          code: 'custom',
          path: ['content', 'categoryTargets', cat],
          message: `categoryTargets references "${cat}" which is not in content.categories.`,
        });
      }
    }
    if (!pack.authors.some((a) => a.slug === pack.content.defaultAuthorSlug)) {
      ctx.addIssue({
        code: 'custom',
        path: ['content', 'defaultAuthorSlug'],
        message: `defaultAuthorSlug "${pack.content.defaultAuthorSlug}" matches no author slug.`,
      });
    }
  });

export type DomainPackInput = z.input<typeof domainPackSchema>;
