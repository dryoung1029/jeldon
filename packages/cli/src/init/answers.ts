/**
 * The `--answers` file: everything `jeldon init` needs to spawn a site
 * non-interactively (an agent in another session fills it). Published as JSON
 * Schema in `schemas/init-answers.schema.json`. Every field the interview would
 * ask is here; anything omitted is asked (interactive) or left as a `SETUP:`
 * marker (non-interactive with --yes).
 */
import { z } from 'zod';

const url = z.string().url();
const route = z.string().regex(/^\/(?:[a-z0-9-]+\/)*$/, 'route like /segment/');

export const initAnswersSchema = z.object({
  $schema: z.string().optional(),
  kit: z.literal('local-business').default('local-business'),
  vertical: z.enum(['gym', 'clinic', 'studio', 'shop', 'generic']).default('generic'),

  business: z.object({
    name: z.string().min(1),
    /** Canonical URL of the NEW site, e.g. https://www.acme-gym.com */
    url: url,
    /** The OLD site to learn from (scraped). Omit for a brand-new business. */
    oldUrl: url.optional(),
    tagline: z.string().optional(),
    shortPitch: z.string().optional(),
    /** "a small-group strength gym" — used in CLAUDE.md's first line. */
    descriptor: z.string().optional(),
    phone: z.string().optional(),
    phoneDisplay: z.string().optional(),
    email: z.string().optional(),
    address: z.object({
      street: z.string().optional(), city: z.string().optional(), region: z.string().optional(),
      postalCode: z.string().optional(), landmark: z.string().optional(), mapsUrl: z.string().optional(),
      mapsEmbedUrl: z.string().optional(), placeId: z.string().optional(),
      geo: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
    }).optional(),
    hours: z.record(z.string()).optional(),
    hoursConfirmed: z.boolean().default(false),
    social: z.record(z.string()).optional(),
    /** Area framing for the pack (brand.geoFraming), e.g. "Springfield, Oregon and the surrounding valley". */
    geoFraming: z.string().optional(),
    priceRange: z.string().optional(),
  }),

  owner: z.object({
    name: z.string().min(1),
    /** How the owner should be addressed in the agent kit (their first name). */
    firstName: z.string().optional(),
    title: z.string().optional(),
    credential: z.string().optional(),
    slug: z.string().optional(),
    jobTitle: z.string().optional(),
    knowsAbout: z.array(z.string()).optional(),
    alumniOf: z.array(z.string()).optional(),
    memberOf: z.array(z.string()).optional(),
    sameAs: z.array(z.string()).optional(),
    bio: z.string().optional(),
  }),

  /** The technical helper named in the agent kit for the DNS step. */
  helper: z.object({ name: z.string().min(1), fullName: z.string().optional() }).default({ name: 'your helper' }),

  repo: z.object({
    /** GitHub repo name the owner creates, e.g. helix-training-site. */
    name: z.string().optional(),
    /** Template repo URL for START-HERE ("Use this template"). */
    templateUrl: z.string().optional(),
  }).default({}),

  brand: z.object({
    /** Named palette → jeldon.config.ts brand.brandColors. */
    colors: z.record(z.string()).optional(),
    /** Role map → kit.config.ts theme (keys into colors, or hex). */
    theme: z.object({ primary: z.string().optional(), accent: z.string().optional(), neutral: z.string().optional(), highlight: z.string().optional() }).optional(),
    fonts: z.object({ display: z.string().optional(), body: z.string().optional(), googleFontsHref: z.string().optional() }).optional(),
    logoUrl: z.string().optional(),
    ogImage: z.string().optional(),
  }).default({}),

  labels: z.record(z.unknown()).optional(),
  routes: z.object({
    services: route.optional(), team: route.optional(), pricing: route.optional(), schedule: route.optional(),
    contact: route.optional(), primaryCta: route.optional(), blog: route.optional(), faq: route.optional(),
    about: route.optional(), members: route.optional(), privacy: route.optional(), terms: route.optional(), thanks: route.optional(),
  }).default({}),
  /** Content directory names (the words the owner uses), e.g. programs / coaches. */
  collections: z.object({ services: z.string().optional(), team: z.string().optional() }).default({}),

  nav: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
  primaryCta: z.object({ label: z.string(), href: z.string().optional() }).optional(),

  home: z.object({
    heroKicker: z.string().optional(),
    heroTitle: z.string().optional(),
    heroLede: z.string().optional(),
    pillars: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
    steps: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
    quote: z.string().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
  }).default({}),

  services: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    tagline: z.string(),
    audience: z.string(),
    order: z.number().optional(),
    signupPlanKey: z.string().optional(),
    signupUrl: z.string().optional(),
    signupLabel: z.string().optional(),
    price: z.string().optional(),
    duration: z.string().optional(),
    format: z.string().optional(),
    serviceType: z.string().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    /** Markdown body. A `SETUP:` comment is prepended unless `confirmed`. */
    body: z.string().optional(),
    confirmed: z.boolean().optional(),
    /** Old-site slugs that should 301 here. */
    oldSlugs: z.array(z.string()).optional(),
  })).default([]),

  team: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    role: z.string(),
    credentials: z.string().optional(),
    order: z.number().optional(),
    specialties: z.array(z.string()).optional(),
    photo: z.string().optional(),
    bio: z.string().optional(),
    confirmed: z.boolean().optional(),
  })).default([]),

  faqs: z.array(z.object({
    id: z.string().optional(),
    pages: z.array(z.string()),
    order: z.number().optional(),
    question: z.string(),
    answer: z.string(),
  })).default([]),

  /** Seed articles, written as DRAFTS (the owner approves with /publish). */
  articles: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    excerpt: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    publishDate: z.string().optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    docNotes: z.string().optional(),
    /** Markdown body. */
    body: z.string(),
  })).default([]),

  pricing: z.array(z.object({
    name: z.string(), price: z.string(), period: z.string(), note: z.string().optional(),
    planKey: z.string().optional(), featured: z.boolean().optional(),
  })).default([]),
  pricingNote: z.string().optional(),

  booking: z.object({
    kind: z.enum(['pushpress', 'iframe', 'link', 'none']).default('none'),
    calendarUrl: z.string().optional(),
    embedUrl: z.string().optional(),
    pushpressSubdomain: z.string().optional(),
    plans: z.record(z.string()).optional(),
    widgets: z.object({ reviewWidgetUrl: z.string().optional(), pricingFormUrl: z.string().optional() }).optional(),
    memberApp: z.object({ ios: z.string().optional(), android: z.string().optional() }).optional(),
    timezone: z.string().optional(),
  }).default({}),

  contact: z.object({
    crm: z.enum(['pushpress', 'gohighlevel', 'brevo-contact', 'none']).default('none'),
    notify: z.enum(['brevo', 'resend', 'none']).default('none'),
    subjects: z.array(z.string()).optional(),
    hint: z.string().optional(),
    turnstileSiteKey: z.string().optional(),
    goHighLevelWebhookUrl: z.string().optional(),
  }).default({}),

  analytics: z.object({
    cloudflareToken: z.string().optional(),
    googleSiteVerification: z.string().optional(),
    ga4MeasurementId: z.string().optional(),
  }).default({}),

  content: z.object({
    categories: z.record(z.number()).optional(),
    tags: z.array(z.string()).optional(),
    timezone: z.string().optional(),
    geoFloor: z.number().optional(),
    /** Migrate the old site's blog posts as drafts. Default true when oldUrl is set. */
    migratePosts: z.boolean().optional(),
  }).default({}),

  voice: z.object({
    persona: z.string().optional(),
    bannedTopics: z.array(z.string()).optional(),
    bannedPhrasings: z.array(z.string()).optional(),
    rules: z.array(z.string()).optional(),
    readingGradeBand: z.tuple([z.number(), z.number()]).optional(),
  }).default({}),

  aeo: z.object({
    brandMentions: z.array(z.string()).optional(),
    localSearchLocation: z.string().optional(),
    querySet: z.array(z.object({ id: z.string(), query: z.string(), tags: z.array(z.string()) })).optional(),
    highPriorityTags: z.array(z.string()).optional(),
  }).default({}),

  competitors: z.object({
    roster: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })).optional(),
    targetKeywords: z.array(z.string()).optional(),
    localPackLocation: z.string().optional(),
  }).default({}),

  schema: z.object({
    orgType: z.array(z.string()).optional(),
    llmsTxt: z.object({ summary: z.string().optional(), intro: z.string().optional() }).optional(),
    sameAs: z.array(z.string()).optional(),
  }).default({}),

  compliance: z.object({
    pack: z.string().default('none'),
    requireHumanReviewTags: z.array(z.string()).optional(),
  }).default({ pack: 'none' }),

  /** Explicit old-path → new-path redirects (win over heuristics). */
  redirects: z.record(z.string()).default({}),

  copy: z.object({
    articleDisclaimer: z.string().optional(),
    footerCtaTitle: z.string().optional(),
    footerCtaText: z.string().optional(),
    notFoundTitle: z.string().optional(),
    notFoundText: z.string().optional(),
    /** Who writes the articles, for the agent kit ("a coach", "a clinician"). */
    expertDescriptor: z.string().optional(),
    /** Primary sources the vertical cites, for /article ("PubMed, ACSM, NSCA"). */
    sourcesHint: z.string().optional(),
    /** "gyms", "clinics", "bike shops" — for /competitors. */
    competitorNoun: z.string().optional(),
    /** "strength training", "back pain", "bike repair" — for /reddit-ideas. */
    topicNoun: z.string().optional(),
  }).default({}),
});

export type InitAnswers = z.infer<typeof initAnswersSchema>;
export type InitAnswersInput = z.input<typeof initAnswersSchema>;
