/**
 * Generate a consumer repo from the skeleton (template + kit) and the
 * answers. Every step is idempotent: re-running fills gaps and never
 * overwrites a file the owner has edited, unless --force.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { articlePathSegment, normalizePrefix } from '@jeldon/config';
import { LABEL_PRESETS, VERTICAL_SCORING, matchSlug, pathOf, planRedirects, renderOldUrlsDoc, renderRedirectsFile, resolveLabels, DEFAULT_ROUTES, type KitRoutes } from '@jeldon/kit-local-business';
import type { InitAnswers } from './answers.js';
import { renderTemplate } from './render.js';
import type { Scrape } from './scrape.js';

export interface GenerateOptions {
  dir: string;
  answers: InitAnswers;
  scrape: Scrape | null;
  /** Overwrite files that already exist (default: only write missing files + always regenerate derived files). */
  force?: boolean;
  /** Engine version range written into package.json (default ^0.1.0). */
  engineRange?: string;
  /** Use file: links to a local monorepo instead of npm ranges (dev / smoke). */
  vendorFrom?: string;
  log?: (line: string) => void;
}

export interface GenerateReport {
  written: string[];
  skipped: string[];
  setupMarkers: number;
  routes: KitRoutes;
  templateMissingVars: string[];
}

const here = dirname(fileURLToPath(import.meta.url));

/** Locate the skeleton: the published package's `skeleton/`, else the monorepo's template/ + kits/. */
export function skeletonRoots(): { template: string; kits: string } {
  const candidates = [resolve(here, '../skeleton'), resolve(here, '../../skeleton'), resolve(here, '../../../..'), resolve(here, '../../..')];
  for (const c of candidates) {
    if (existsSync(join(c, 'template', 'package.json')) && existsSync(join(c, 'kits'))) return { template: join(c, 'template'), kits: join(c, 'kits') };
  }
  throw new Error('Cannot find the site skeleton (template/ + kits/). Reinstall @jeldon/cli or run from the Jeldon monorepo.');
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const q = (s: string) => JSON.stringify(s);
const setup = (confirmed: boolean | undefined, note: string) => (confirmed ? '' : ` // SETUP: ${note}`);
const tsObj = (v: unknown, indent = 2): string => {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => `${pad}  ${tsObj(x, indent + 2)},`).join('\n')}\n${pad}]` : '[]';
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, x]) => `${pad}  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : q(k)}: ${tsObj(x, indent + 2)},`).join('\n')}\n${pad}}`;
  }
  if (typeof v === 'string') return q(v).replace(/^"|"$/g, "'").replace(/\\"/g, '"').replace(/'/g, "\\'").replace(/^\\'|\\'$/g, "'");
  return String(v);
};
// Simpler and safe: always JSON-quote strings (valid TS).
const ts = (v: unknown, indent = 2): string => {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => `${pad}  ${ts(x, indent + 2)},`).join('\n')}\n${pad}]` : '[]';
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, x]) => `${pad}  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : q(k)}: ${ts(x, indent + 2)},`).join('\n')}\n${pad}}`;
  }
  if (typeof v === 'string') return q(v);
  return String(v);
};
void tsObj;

export function resolveRoutes(a: InitAnswers): KitRoutes {
  const r = { ...DEFAULT_ROUTES, ...Object.fromEntries(Object.entries(a.routes).filter(([, v]) => v)) } as KitRoutes;
  for (const k of Object.keys(r) as (keyof KitRoutes)[]) r[k] = normalizePrefix(r[k]);
  return r;
}

export function buildAgentVars(a: InitAnswers, routes: KitRoutes): Record<string, unknown> {
  const labels = resolveLabels(a.vertical, a.labels as never);
  const host = new URL(a.business.url).host;
  const owner = a.owner;
  const first = owner.firstName ?? owner.name.replace(/^Dr\.\s*/, '').split(' ')[0]!;
  const servicesDir = a.collections.services ?? `src/content/${slugify(labels.services.plural)}`;
  const teamDir = a.collections.team ?? `src/content/${slugify(labels.team.plural)}`;
  const leadSinkLabel = { pushpress: 'PushPress lead', gohighlevel: 'GoHighLevel contact', 'brevo-contact': 'Brevo contact', none: 'no CRM (email only)' }[a.contact.crm];
  const crmAccountName = { pushpress: 'PushPress', gohighlevel: 'GoHighLevel', 'brevo-contact': 'Brevo', none: '' }[a.contact.crm];
  const notifierLabel = { brevo: 'Brevo', resend: 'Resend', none: '' }[a.contact.notify];
  const hipaa = a.compliance.pack === 'hipaa';
  return {
    businessName: a.business.name,
    businessDescriptor: a.business.descriptor ?? '',
    city: a.business.address?.city ?? '',
    cityLower: (a.business.address?.city ?? '').toLowerCase().replace(/\s+/g, ''),
    region: a.business.address?.region ?? '',
    ownerName: owner.name,
    ownerFirstName: first,
    helperName: a.helper.name,
    helperFullName: a.helper.fullName ?? '',
    siteHost: host,
    oldUrl: a.business.oldUrl ?? a.business.url,
    repoName: a.repo.name ?? `${slugify(a.business.name)}-site`,
    templateRepoUrl: a.repo.templateUrl ?? 'https://github.com/dryoung1029/jeldon',
    vertical: a.vertical,
    servicesPlural: labels.services.plural,
    servicesPluralLower: labels.services.plural.toLowerCase(),
    servicesSingular: labels.services.singular,
    servicesSingularLower: labels.services.singular.toLowerCase(),
    teamPlural: labels.team.plural,
    teamPluralLower: labels.team.plural.toLowerCase(),
    teamSingular: labels.team.singular,
    clientSingular: labels.client.singular,
    clientPlural: labels.client.plural,
    primaryCtaLabel: labels.primaryCta.label,
    primaryCtaShort: labels.primaryCta.short,
    blogLabel: labels.blog,
    blogLabelLower: labels.blog.toLowerCase(),
    membersLabel: labels.members ?? '',
    scheduleLabel: labels.schedule ?? 'Schedule',
    scheduleDescription: a.booking.kind === 'pushpress' ? 'This week\'s classes (from the booking system) and the booking calendar' : a.booking.kind === 'none' ? 'Hours' : 'The calendar and booking link',
    pricingLabel: labels.pricing ?? 'Pricing',
    routeServices: routes.services, routeTeam: routes.team, routePricing: routes.pricing, routeSchedule: routes.schedule,
    routeContact: routes.contact, routePrimaryCta: routes.primaryCta, routeBlog: routes.blog, routeFaq: routes.faq,
    routeAbout: routes.about, routeMembers: routes.members,
    contentDirArticles: 'src/content/articles',
    contentDirServices: servicesDir,
    contentDirTeam: teamDir,
    faqsFile: 'src/content/faqs.json',
    leadSink: a.contact.crm,
    leadSinkLabel,
    crmAccountName,
    notifier: a.contact.notify,
    notifierLabel,
    notifierEnvKey: a.contact.notify === 'brevo' ? 'BREVO_API_KEY' : a.contact.notify === 'resend' ? 'RESEND_API_KEY' : '',
    bookingKind: a.booking.kind,
    bookingIsPushpress: a.booking.kind === 'pushpress',
    pushpressSubdomain: a.booking.pushpressSubdomain ?? '',
    hipaa,
    compliancePack: a.compliance.pack,
    hasSiteVerification: Boolean(a.analytics.googleSiteVerification),
    expertDescriptor: a.copy.expertDescriptor ?? (a.vertical === 'gym' ? 'a coach' : a.vertical === 'clinic' ? 'a clinician' : 'the owner'),
    sourcesHint: a.copy.sourcesHint ?? (a.vertical === 'gym' || a.vertical === 'clinic' || a.vertical === 'studio' ? 'PubMed, Cochrane, CDC, professional bodies, university pages' : 'manufacturer documentation, standards bodies, .gov and .edu pages'),
    competitorNoun: a.copy.competitorNoun ?? `${labels.services.plural.toLowerCase()} providers`,
    topicNoun: a.copy.topicNoun ?? labels.services.plural.toLowerCase(),
  };
}

function copyTree(src: string, dest: string, opts: { force: boolean; written: string[]; skipped: string[]; filter?: (rel: string) => boolean }) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    const rel = relative(dest, d);
    if (opts.filter && !opts.filter(rel)) continue;
    if (entry.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyTree(s, d, { ...opts, filter: undefined });
    } else if (opts.force || !existsSync(d)) {
      mkdirSync(dirname(d), { recursive: true });
      cpSync(s, d);
      opts.written.push(d);
    } else {
      opts.skipped.push(d);
    }
  }
}

function write(path: string, content: string, force: boolean, report: GenerateReport, always = false) {
  if (!always && !force && existsSync(path)) {
    report.skipped.push(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  report.written.push(path);
}

export function generateJeldonConfig(a: InitAnswers, routes: KitRoutes, scrape: Scrape | null): string {
  const v = VERTICAL_SCORING[a.vertical];
  const siteUrl = a.business.url.replace(/\/$/, '');
  const owner = a.owner;
  const ownerSlug = owner.slug ?? slugify(owner.name.replace(/^Dr\.\s*/, '').replace(/,.*$/, ''));
  const categories = a.content.categories ?? v.categories;
  const floor = a.content.geoFloor ?? Math.min(70, ...Object.values(categories));
  const nap = a.business.address ?? {};
  const seg = articlePathSegment({ content: { articlePathPrefix: routes.blog } });
  const prefixes = [...new Set([seg, ...Object.values(routes).map((r) => r.replace(/\//g, '')).filter(Boolean)])];
  const sameAs = a.schema.sameAs ?? Object.values(a.business.social ?? {}).filter(Boolean);
  const persona = a.voice.persona ?? `${owner.name}, who runs ${a.business.name}${nap.city ? ` in ${nap.city}` : ''}. Warm, direct, plain words a smart 9th grader would follow. Speaks from experience in the first person. Never preachy, never a hype machine.`;
  const orgExtra: Record<string, unknown> = {};
  if (a.business.priceRange) orgExtra.priceRange = a.business.priceRange;
  if (a.business.address?.geo) orgExtra.geo = { '@type': 'GeoCoordinates', latitude: a.business.address.geo.latitude, longitude: a.business.address.geo.longitude };
  const llms = a.schema.llmsTxt ?? {};
  const labels = resolveLabels(a.vertical, a.labels as never);

  return `/**
 * ${a.business.name.toUpperCase()} — DOMAIN PACK
 *
 * The one file that tells the Jeldon content engine who ${a.business.name} is:
 * brand, author, voice, scoring, citation policy, competitors. Generated by
 * \`jeldon init\` (${new Date().toISOString().slice(0, 10)})${scrape ? ` from ${scrape.url}` : ''}.
 * Values marked \`// SETUP:\` are placeholders or scraped facts the /setup
 * wizard confirms with the owner. Field-by-field guide: docs/JELDON.md.
 */
import { defineDomainPack, defaultScoringConfig } from '@jeldon/config';

const SITE_URL = ${q(siteUrl)};

export default defineDomainPack({
  brand: {
    name: ${q(a.business.name)},
    siteUrl: SITE_URL,
    tagline: ${q(a.business.tagline ?? '')},${setup(Boolean(a.business.tagline), 'one-line positioning')}
    geoFraming: ${q(a.business.geoFraming ?? [nap.city, nap.region].filter(Boolean).join(', '))},
    nap: {
      address: ${q(nap.street ?? '')},
      city: ${q(nap.city ?? '')},
      region: ${q(nap.region ?? '')},
      postalCode: ${q(nap.postalCode ?? '')},
      phone: ${q(a.business.phone ?? '')},
      placeId: ${q(nap.placeId ?? '')},${setup(Boolean(nap.placeId), 'Google Business Profile place ID (wizard finds it)')}
    },
    logoUrl: ${q(a.brand.logoUrl ?? '/brand/logo.svg')},
    brandColors: ${ts(a.brand.colors ?? { primary: scrape?.themeColor ?? '#1f6feb', accent: '#d1242f', neutral: '#24292f', highlight: '#e8b04a' }, 4)},
    fonts: ${ts(a.brand.fonts ?? {}, 4)},
  },

  authors: [
    {
      slug: ${q(ownerSlug)},
      name: ${q(owner.name)},
      title: ${q(owner.title ?? 'Owner')},
      schemaId: \`\${SITE_URL}${routes.team}#${ownerSlug}\`,
      isPrimary: true,
      urlPrefix: ${q(routes.team)},
      profile: {
        name: ${q(owner.name.replace(/^Dr\.\s*/, '').replace(/,.*$/, ''))},
        jobTitle: ${q(owner.jobTitle ?? owner.title ?? `Owner of ${a.business.name}`)},
        url: \`\${SITE_URL}${routes.team}\`,
        credential: ${q(owner.credential ?? '')},
        knowsAbout: ${ts(owner.knowsAbout ?? [], 8)},${setup(Boolean(owner.knowsAbout?.length), 'topics the owner is an authority on')}
        alumniOf: ${ts(owner.alumniOf ?? [], 8)},${setup(Boolean(owner.alumniOf?.length), 'school / program')}
        memberOf: ${ts(owner.memberOf ?? [], 8)},${setup(Boolean(owner.memberOf?.length), 'professional bodies')}
        sameAs: ${ts(owner.sameAs ?? sameAs, 8)},
      },
    },
  ],

  voice: {
    persona: ${q(persona)},${setup(Boolean(a.voice.persona), 'rewritten with the owner in /setup stage 4')}
    bannedTopics: ${ts(a.voice.bannedTopics ?? [], 4)},
    bannedPhrasings: ${ts(a.voice.bannedPhrasings ?? ['studies have shown', 'unlock your potential', 'game-changer', 'in today\'s fast-paced world'], 4)},
    rules: ${ts(a.voice.rules ?? [
      'Lead with the reader\'s question and answer it in the first two sentences.',
      'Use "I" and "we" — this is a person talking, not a brochure.',
      'When a claim rests on research, link the actual source in a References section. Never invent a citation.',
      'If a section would only hit a score check by flattening the voice, cut the claim instead.',
      `Mention ${nap.city ?? 'the area'} naturally when it fits; never stuff it.`,
      'Every article ends with one plain next step.',
    ], 4)},
    voiceAnchorUrls: [], // SETUP: add 1–2 published articles once the owner approves them
    readingGradeBand: ${ts(a.voice.readingGradeBand ?? v.readingBand, 4)},
  },

  content: {
    categories: ${ts(Object.keys(categories), 4)},
    categoryTargets: ${ts(categories, 4)},
    tags: ${ts(a.content.tags ?? [], 4)},${setup(Boolean(a.content.tags?.length), 'curated tag vocabulary (3–6 per article are drawn from here)')}
    articlePathPrefix: ${q(routes.blog)},
    noindexPaths: [${q(routes.thanks)}],
    defaultAuthorSlug: ${q(ownerSlug)},
    timezone: ${q(a.content.timezone ?? a.booking.timezone ?? 'America/Los_Angeles')},
  },

  scoring: {
    ...defaultScoringConfig,
    geo: {
      ...defaultScoringConfig.geo,
      floor: ${floor},
      checks: defaultScoringConfig.geo.checks.map((check) => {
        if (check.id === 'citation') return { ...check, patterns: ${ts(v.citationPatterns, 10)} };
        if (check.id === 'firstPerson') return { ...check, patterns: ${ts(v.firstPersonPatterns, 10)} };
        return check;
      }),
    },
    seo: {
      ...defaultScoringConfig.seo,
      internalLinkPrefixes: ${ts(prefixes, 6)},
      reading: { good: ${ts(a.voice.readingGradeBand ?? v.readingBand)}, mehMax: 11 },
      wordCount: { good: [800, 1800], mehMin: 500 },
    },
  },

  citation: {
    policy: 'direct-source-urls',
    forbiddenPatterns: [],
    referenceFormat: 'Author or organization, year. Short description. [link](URL)',
    verifier: { kind: 'none' }, // the coding agent opens every reference link before publishing
  },

  aeo: {
    brandMentions: ${ts(a.aeo.brandMentions ?? [a.business.name.toLowerCase(), new URL(siteUrl).hostname.replace(/^www\./, '').split('.')[0]!], 4)},
    localSearchLocation: ${q(a.aeo.localSearchLocation ?? [nap.city, nap.region].filter(Boolean).join(', '))},
    querySet: ${ts(a.aeo.querySet ?? [
      { id: 'q1', query: `best ${labels.services.singular.toLowerCase()} ${nap.city ?? ''}`.trim(), tags: ['discovery', 'local'] },
      { id: 'q2', query: `${a.business.name} reviews`, tags: ['discovery', 'local'] },
      { id: 'q3', query: `how to choose a ${labels.services.singular.toLowerCase()} in ${nap.city ?? 'my area'}`, tags: ['education'] },
    ], 4)},${setup(Boolean(a.aeo.querySet?.length), 'the questions we want to be the answer to')}
    engines: ['perplexity', 'anthropic'],
    highPriorityTags: ${ts(a.aeo.highPriorityTags ?? ['discovery', 'local'], 4)},
  },

  competitors: {
    ourName: ${q(a.business.name)},
    ourPlaceId: ${q(nap.placeId ?? '')},
    localPackLocation: ${q(a.competitors.localPackLocation ?? [nap.city, nap.region].filter(Boolean).join(', '))},
    roster: ${ts(a.competitors.roster ?? [], 4)},${setup(Boolean(a.competitors.roster?.length), '/competitors discovers and adds more')}
    targetKeywords: ${ts(a.competitors.targetKeywords ?? [], 4)},
    highValuePatterns: ['/blog', '/pricing', '/membership', '/schedule', '/free', '/trial', '/about', '/services', '/programs'],
    skipPatterns: ['/wp-admin', '/cart', '/login', '/privacy', '/terms'],
    templateVendors: [
      { name: 'PushPress', fingerprints: ['pushpress.com', 'Site by PushPress'] },
      { name: 'Webflow', fingerprints: ['website-files.com', 'data-wf-page'] },
      { name: 'Wix', fingerprints: ['wixstatic.com', 'wix-code'] },
      { name: 'Squarespace', fingerprints: ['squarespace.com', 'static1.squarespace'] },
      { name: 'WordPress', fingerprints: ['wp-content', 'wp-includes'] },
      { name: 'Mindbody', fingerprints: ['mindbodyonline.com'] },
      { name: 'Zen Planner', fingerprints: ['zenplanner.com'] },
      { name: 'Wodify', fingerprints: ['wodify.com'] },
    ],
  },

  schema: {
    orgType: ${ts(a.schema.orgType ?? v.orgType, 4)},
    org: {
      name: ${q(a.business.name)},
      url: SITE_URL,
      logoUrl: \`\${SITE_URL}${a.brand.logoUrl ?? '/brand/logo.svg'}\`,
      sameAs: ${ts(sameAs, 6)},
      extra: ${ts(orgExtra, 6)},
    },
    articleTypes: ['Article'],
    emitLlmsTxt: true,
    llmsTxt: {
      summary: ${q(llms.summary ?? a.business.shortPitch ?? a.business.tagline ?? a.business.name)},
      intro: ${q(llms.intro ?? `Articles are written by ${owner.name} and cite primary sources.`)},
      sections: [
        {
          heading: 'Key pages',
          items: [
            { label: ${q(labels.services.plural)}, url: \`\${SITE_URL}${routes.services}\` },
            { label: ${q(labels.pricing ?? 'Pricing')}, url: \`\${SITE_URL}${routes.pricing}\` },
            { label: ${q(labels.primaryCta.short)}, url: \`\${SITE_URL}${routes.primaryCta}\` },
            { label: ${q(labels.team.plural)}, url: \`\${SITE_URL}${routes.team}\` },
            { label: ${q(labels.blog)}, url: \`\${SITE_URL}${routes.blog}\` },
          ],
        },
      ],
    },
  },

  compliance: {
    pack: ${q(a.compliance.pack)},
    requireHumanReviewTags: ${ts(a.compliance.requireHumanReviewTags ?? v.reviewTags, 4)},
  },

  capabilities: {
    drafting: 'agent', // Claude Code drafts with \`npm run brief\`; no API key.
    amplify: false,
    audio: false,
    heroImages: false,
    competitiveIntel: true,
    engagementAnalytics: false,
    entityPresence: false,
  },

  services: {
    store: 'fs',
    contentDir: 'src/content/articles',
    analytics: 'none',
    requiredEnv: [], // the kit's secrets are checked by the registered kit checks in \`jeldon doctor\`
  },
});
`;
}

export function generateKitConfig(a: InitAnswers, routes: KitRoutes, scrape: Scrape | null): string {
  const labels = resolveLabels(a.vertical, a.labels as never);
  const nap = a.business.address ?? {};
  const servicesDir = a.collections.services ?? `src/content/${slugify(labels.services.plural)}`;
  const teamDir = a.collections.team ?? `src/content/${slugify(labels.team.plural)}`;
  const nav = a.nav ?? [
    { label: labels.services.plural, href: routes.services },
    ...(a.booking.kind !== 'none' ? [{ label: labels.schedule ?? 'Schedule', href: routes.schedule }] : []),
    { label: labels.pricing ?? 'Pricing', href: routes.pricing },
    { label: labels.team.plural, href: routes.team },
    { label: labels.blog, href: routes.blog },
    { label: labels.contact ?? 'Contact', href: routes.contact },
  ];
  const hours = { Mon: '', Tue: '', Wed: '', Thu: '', Fri: '', Sat: '', Sun: '', ...(a.business.hours ?? {}) };
  const kit = {
    vertical: a.vertical,
    labels: a.labels ?? {},
    routes,
    collections: { services: servicesDir, team: teamDir, faqs: 'src/content/faqs.json' },
    site: {
      name: a.business.name,
      url: a.business.url.replace(/\/$/, ''),
      tagline: a.business.tagline ?? '',
      shortPitch: a.business.shortPitch ?? '',
      phone: a.business.phone ?? '',
      phoneDisplay: a.business.phoneDisplay ?? a.business.phone ?? '',
      email: a.business.email ?? '',
      address: { street: nap.street ?? '', city: nap.city ?? '', region: nap.region ?? '', postalCode: nap.postalCode ?? '', landmark: nap.landmark ?? '', mapsUrl: nap.mapsUrl ?? '', mapsEmbedUrl: nap.mapsEmbedUrl ?? '' },
      hours,
      hoursConfirmed: a.business.hoursConfirmed,
      social: a.business.social ?? {},
      logo: a.brand.logoUrl ?? '/brand/logo.svg',
      ogImage: a.brand.ogImage ?? a.brand.logoUrl ?? '/brand/logo.svg',
      heroKicker: a.home.heroKicker ?? [nap.city, nap.region].filter(Boolean).join(', '),
      heroTitle: a.home.heroTitle ?? a.business.tagline ?? a.business.name,
      heroLede: a.home.heroLede ?? a.business.shortPitch ?? '',
      pillars: a.home.pillars ?? [],
      steps: a.home.steps ?? [],
      quote: a.home.quote ?? '',
    },
    theme: a.brand.theme ?? { primary: Object.keys(a.brand.colors ?? {})[0] ?? 'primary', accent: Object.keys(a.brand.colors ?? {})[1] ?? 'accent', neutral: Object.keys(a.brand.colors ?? {})[2] ?? 'neutral', highlight: Object.keys(a.brand.colors ?? {})[3] ?? 'highlight' },
    nav,
    primaryCta: { label: a.primaryCta?.label ?? labels.primaryCta.label, href: a.primaryCta?.href ?? routes.primaryCta },
    booking: {
      kind: a.booking.kind,
      calendarUrl: a.booking.calendarUrl ?? '',
      embedUrl: a.booking.embedUrl,
      pushpressSubdomain: a.booking.pushpressSubdomain,
      plans: a.booking.plans ?? {},
      widgets: a.booking.widgets,
      memberApp: a.booking.memberApp,
      timezone: a.booking.timezone ?? a.content.timezone ?? 'America/Los_Angeles',
    },
    pricing: a.pricing,
    pricingNote: a.pricingNote ?? '',
    analytics: { cloudflareToken: a.analytics.cloudflareToken ?? '', googleSiteVerification: a.analytics.googleSiteVerification ?? scrape?.googleSiteVerification ?? '', ga4MeasurementId: a.analytics.ga4MeasurementId ?? '' },
    contact: {
      leadSink: a.contact.crm,
      notifier: a.contact.notify,
      subjects: a.contact.subjects ?? [labels.primaryCta.short, `${labels.services.singular} question`, `${labels.pricing ?? 'Pricing'} question`, 'Something else'],
      turnstileSiteKey: a.contact.turnstileSiteKey ?? '',
      hint: a.contact.hint ?? '',
      goHighLevelWebhookUrl: a.contact.goHighLevelWebhookUrl,
    },
    copy: {
      articleDisclaimer: a.copy.articleDisclaimer,
      footerCtaTitle: a.copy.footerCtaTitle ?? labels.primaryCta.pitch,
      footerCtaText: a.copy.footerCtaText,
      notFoundTitle: a.copy.notFoundTitle,
      notFoundText: a.copy.notFoundText,
    },
  };
  const markers: string[] = [];
  if (!a.business.hoursConfirmed) markers.push('hours: the wizard asks day by day, then sets hoursConfirmed: true');
  if (!a.business.email) markers.push('email: which inbox gets website messages');
  if (!a.analytics.cloudflareToken) markers.push('analytics.cloudflareToken: Cloudflare → Web Analytics');
  if (a.contact.crm === 'none' && a.contact.notify === 'none') markers.push('contact: pick a leadSink and/or notifier in /setup stage 7');
  return `/**
 * KIT CONFIG — everything about the WEBSITE that is not the content engine:
 * routes, vocabulary, hours, pricing, booking links, social links, analytics
 * IDs, the contact-form wiring. Pages read from here so there is one place to
 * change a phone number or a price. Generated by \`jeldon init\`${scrape ? ` from ${scrape.url}` : ''}.
 *
 * PLAIN DATA ONLY — the single import is type-only (erased at build), so this
 * file bundles into the contact-form Worker with no Node code. Keep name / URL /
 * phone in sync with jeldon.config.ts (the wizard edits both).
 *
${markers.length ? markers.map((m) => ` * SETUP: ${m}`).join('\n') + '\n' : ''} */
import type { KitConfig } from '@jeldon/kit-local-business';

export const kit: KitConfig = ${ts(kit, 0)};

export default kit;
`;
}

function frontmatter(obj: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (!v.length) {
        lines.push(`${k}: []`);
      } else if (typeof v[0] === 'object') {
        lines.push(`${k}:`);
        for (const item of v as Record<string, string>[]) {
          const entries = Object.entries(item);
          lines.push(`  - ${entries[0]![0]}: ${JSON.stringify(entries[0]![1])}`);
          for (const [ik, iv] of entries.slice(1)) lines.push(`    ${ik}: ${JSON.stringify(iv)}`);
        }
      } else {
        lines.push(`${k}: ${JSON.stringify(v)}`);
      }
    } else if (typeof v === 'boolean' || typeof v === 'number') lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${JSON.stringify(v)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

export function generate(opts: GenerateOptions): GenerateReport {
  const { dir, answers: a, scrape } = opts;
  const force = Boolean(opts.force);
  const log = opts.log ?? (() => undefined);
  const report: GenerateReport = { written: [], skipped: [], setupMarkers: 0, routes: resolveRoutes(a), templateMissingVars: [] };
  const routes = report.routes;
  const labels = resolveLabels(a.vertical, a.labels as never);
  const roots = skeletonRoots();
  const kitDir = join(roots.kits, a.kit);
  if (!existsSync(kitDir)) throw new Error(`Unknown kit "${a.kit}" (no ${kitDir})`);
  mkdirSync(dir, { recursive: true });

  // 1. Template, then kit overlay (kit wins). Skip the kit's own meta files.
  copyTree(roots.template, dir, { force, written: report.written, skipped: report.skipped, filter: (rel) => !/^(README\.md|AGENTS\.md|jeldon\.config\.ts)$/.test(rel) });
  copyTree(kitDir, dir, { force: true, written: report.written, skipped: report.skipped, filter: (rel) => !/^(agent|kit\.package\.json|DESIGN\.md|kit\.config\.ts)$/.test(rel) });
  // The template's article pages are superseded by the kit's; remove the template's example article.
  rmSync(join(dir, 'src/content/articles/hello-jeldon.md'), { force: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  cpSync(join(kitDir, 'DESIGN.md'), join(dir, 'docs/DESIGN.md'));

  // 2. Rename page files + content dirs to the configured routes / collections.
  const pageMoves: Array<[keyof KitRoutes, string]> = [['services', 'services'], ['team', 'team'], ['pricing', 'pricing.astro'], ['schedule', 'schedule.astro'], ['contact', 'contact.astro'], ['primaryCta', 'get-started.astro'], ['blog', 'articles'], ['faq', 'faq.astro'], ['about', 'about.astro'], ['members', 'members.astro'], ['privacy', 'privacy.astro'], ['terms', 'terms.astro'], ['thanks', 'thanks.astro']];
  for (const [key, file] of pageMoves) {
    const target = routes[key].replace(/^\/|\/$/g, '');
    const from = join(dir, 'src/pages', file);
    const isDir = !file.endsWith('.astro');
    const to = join(dir, 'src/pages', isDir ? target : `${target}.astro`);
    if (existsSync(from) && resolve(from) !== resolve(to)) {
      mkdirSync(dirname(to), { recursive: true });
      if (existsSync(to)) rmSync(to, { recursive: true, force: true });
      renameSync(from, to);
      log(`  route ${routes[key]} ← ${relative(dir, from)}`);
    }
  }
  const servicesDir = a.collections.services ?? `src/content/${slugify(labels.services.plural)}`;
  const teamDir = a.collections.team ?? `src/content/${slugify(labels.team.plural)}`;
  for (const [from, to] of [['src/content/services', servicesDir], ['src/content/team', teamDir]] as const) {
    if (from !== to && existsSync(join(dir, from))) {
      mkdirSync(dirname(join(dir, to)), { recursive: true });
      if (!existsSync(join(dir, to))) renameSync(join(dir, from), join(dir, to));
      else rmSync(join(dir, from), { recursive: true, force: true });
    }
  }
  // Placeholder content only when the answers carry none.
  if (a.services.length) rmSync(join(dir, servicesDir, 'example-service.md'), { force: true });
  if (a.team.length) rmSync(join(dir, teamDir, 'owner.md'), { force: true });

  // 3. Configs.
  write(join(dir, 'jeldon.config.ts'), generateJeldonConfig(a, routes, scrape), force, report, true);
  write(join(dir, 'kit.config.ts'), generateKitConfig(a, routes, scrape), force, report, true);
  write(join(dir, 'src/lib/compliance-pack.ts'), `/** Written by jeldon init from jeldon.config.ts compliance.pack. */\nexport const COMPLIANCE_PACK: string = ${q(a.compliance.pack)};\n`, force, report, true);

  // 4. Content from the answers.
  for (const s of a.services) {
    const body = s.body ?? `Describe ${s.name}: what happens, who it is for, how to start.`;
    write(join(dir, servicesDir, `${s.slug}.md`), `${frontmatter({ name: s.name, tagline: s.tagline, audience: s.audience, order: s.order ?? 50, signupPlanKey: s.signupPlanKey, signupUrl: s.signupUrl, signupLabel: s.signupLabel, price: s.price ?? '', duration: s.duration ?? '', format: s.format ?? '', serviceType: s.serviceType, seoTitle: s.seoTitle, seoDescription: s.seoDescription, faqs: s.faqs ?? [] })}\n\n${s.confirmed ? '' : `<!-- SETUP: the owner reviews this copy in the wizard. -->\n\n`}${body.trim()}\n`, force, report);
  }
  for (const t of a.team) {
    write(join(dir, teamDir, `${t.slug}.md`), `${frontmatter({ name: t.name, role: t.role, credentials: t.credentials ?? '', order: t.order ?? 50, photo: t.photo, specialties: t.specialties ?? [] })}\n${t.confirmed ? '' : `<!-- SETUP: bio and credentials to be written in the wizard. -->\n`}${(t.bio ?? `${t.name} is part of the ${a.business.name} team.`).trim()}\n`, force, report);
  }
  if (a.faqs.length) {
    write(join(dir, 'src/content/faqs.json'), JSON.stringify(a.faqs.map((f, i) => ({ id: f.id ?? slugify(f.question), pages: f.pages, order: f.order ?? (i + 1) * 10, question: f.question, answer: f.answer })), null, 2) + '\n', force, report, true);
  }

  // 5a. Seed articles from the answers (always drafts).
  for (const art of a.articles) {
    const author = a.owner;
    const ownerSlug = author.slug ?? slugify(author.name.replace(/^Dr\.\s*/, '').replace(/,.*$/, ''));
    write(join(dir, 'src/content/articles', `${art.slug}.md`), `${frontmatter({ title: art.title, excerpt: art.excerpt, publishDate: art.publishDate ?? new Date().toISOString().slice(0, 10), category: art.category, tags: art.tags, author: author.name, authorSlug: ownerSlug, heroImage: art.heroImage, heroImageAlt: art.heroImageAlt, draft: true, docNotes: art.docNotes ?? 'SEED ARTICLE written by jeldon init as a working example. The owner reviews, edits into their own voice, and /publish flips draft to false. Every reference link must be opened and confirmed before publishing.' })}\n\n${art.body.trim()}\n`, force, report);
  }

  // 5. Migrated posts as drafts.
  const migrate = a.content.migratePosts ?? Boolean(a.business.oldUrl);
  if (migrate && scrape?.posts.length) {
    const cat = Object.keys(a.content.categories ?? VERTICAL_SCORING[a.vertical].categories)[0]!;
    const author = a.owner;
    const ownerSlug = author.slug ?? slugify(author.name.replace(/^Dr\.\s*/, '').replace(/,.*$/, ''));
    for (const p of scrape.posts) {
      const slug = slugify(p.path.split('/').filter(Boolean).pop() ?? p.title).slice(0, 60);
      write(join(dir, 'src/content/articles', `${slug}.md`), `${frontmatter({ title: p.title, excerpt: p.excerpt.slice(0, 200), publishDate: p.date ?? new Date().toISOString().slice(0, 10), category: cat, tags: [], author: author.name, authorSlug: ownerSlug, draft: true, docNotes: `Migrated from ${p.url} by jeldon init. Review, re-source every claim, then /publish.` })}\n\n${p.body.trim()}\n`, force, report);
    }
  }

  // 6. Redirects + OLD-URLS.md from the old sitemap (one plan → two files).
  if (scrape?.sitemapUrls.length) {
    const serviceSlugMap: Record<string, string> = {};
    for (const s of a.services) for (const old of s.oldSlugs ?? []) serviceSlugMap[old] = s.slug;
    // Old person pages → the matching new per-person page (exact slug, else shared name tokens).
    const teamSlugMap: Record<string, string> = {};
    const teamSlugs = a.team.map((t) => t.slug);
    for (const u of scrape.sitemapUrls) {
      const seg = pathOf(u).split('/').filter(Boolean);
      const last = seg[seg.length - 1];
      if (seg.length >= 2 && last && !teamSlugMap[last]) {
        const hit = matchSlug(last, teamSlugs);
        if (hit) teamSlugMap[last] = hit;
      }
    }
    const newPaths = [...Object.values(routes), ...a.services.map((s) => `${routes.services}${s.slug}/`), ...teamSlugs.map((s) => `${routes.team}${s}/`), ...(scrape.posts.map((p) => `${routes.blog}${slugify(p.path.split('/').filter(Boolean).pop() ?? '')}/`))];
    const plan = planRedirects(scrape.sitemapUrls, { routes, overrides: a.redirects, serviceSlugMap, teamSlugMap, newPaths });
    const header = `# Old-site URLs → new pages. Generated by \`jeldon init\` from ${new URL(scrape.finalUrl).host}'s sitemap;\n# the human table is docs/OLD-URLS.md. Add a line to both when a page moves.\n`;
    write(join(dir, 'public/_redirects'), header + renderRedirectsFile(plan), force, report, true);
    write(join(dir, 'docs/OLD-URLS.md'), renderOldUrlsDoc(plan, { oldHost: new URL(scrape.finalUrl).host, notes: [scrape.templateVendor ? `The old site was built on ${scrape.templateVendor}.` : '', scrape.homepageGeoScore != null ? `Old homepage citability (GEO) score: ${scrape.homepageGeoScore}/100 on ${new Date().toISOString().slice(0, 10)}.` : ''].filter(Boolean) }), force, report, true);
  }

  // 7. Agent kit.
  const vars = buildAgentVars(a, routes);
  const agentDir = join(kitDir, 'agent');
  const renderTo = (src: string, dest: string) => {
    const { text, missing } = renderTemplate(readFileSync(src, 'utf8'), vars);
    report.templateMissingVars.push(...missing.filter((m) => !report.templateMissingVars.includes(m)));
    write(dest, text, force, report, true);
  };
  renderTo(join(agentDir, 'CLAUDE.md.tpl'), join(dir, 'CLAUDE.md'));
  for (const f of readdirSync(join(agentDir, 'commands'))) renderTo(join(agentDir, 'commands', f), join(dir, '.claude/commands', f.replace(/\.tpl$/, '')));
  for (const f of readdirSync(join(agentDir, 'docs'))) renderTo(join(agentDir, 'docs', f), join(dir, 'docs', f.replace(/\.tpl$/, '')));
  rmSync(join(dir, 'AGENTS.md'), { force: true });

  // 8. package.json, wrangler, robots, README.
  const repoName = a.repo.name ?? `${slugify(a.business.name)}-site`;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const kitPkg = JSON.parse(readFileSync(join(kitDir, 'kit.package.json'), 'utf8'));
  pkg.name = repoName;
  pkg.description = `${a.business.name} — ${a.business.shortPitch ?? 'website'}. Astro + Cloudflare Workers with the Jeldon content engine, spawned by jeldon init.`;
  pkg.scripts = { ...pkg.scripts, ...kitPkg.scripts };
  pkg.dependencies = { ...pkg.dependencies, ...kitPkg.dependencies };
  pkg.devDependencies = { ...pkg.devDependencies, ...(kitPkg.devDependencies ?? {}) };
  for (const dep of Object.keys(pkg.dependencies)) {
    if (!dep.startsWith('@jeldon/')) continue;
    pkg.dependencies[dep] = opts.vendorFrom ? `file:${opts.vendorFrom}/${dep.replace('@jeldon/', '')}` : (opts.engineRange ?? '^0.1.0');
  }
  write(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', force, report, true);
  const wr = readFileSync(join(dir, 'wrangler.jsonc'), 'utf8').replace(/"name": "jeldon-site",[^\n]*/, `"name": "${repoName}",`);
  write(join(dir, 'wrangler.jsonc'), wr, force, report, true);
  const robots = readFileSync(join(dir, 'public/robots.txt'), 'utf8').replace(/Sitemap: https?:\/\/[^\s]+/, `Sitemap: ${a.business.url.replace(/\/$/, '')}/sitemap-index.xml`).replace(/# SETUP: jeldon init writes the canonical host here.\n/, '');
  write(join(dir, 'public/robots.txt'), robots, force, report, true);
  write(join(dir, 'README.md'), `# ${a.business.name} — website

Fast, SEO/AEO-ready site for ${a.business.name}${a.business.address?.city ? ` (${a.business.address.city}${a.business.address.region ? `, ${a.business.address.region}` : ''})` : ''}. Astro 5 + Cloudflare
Workers, with the Jeldon content engine for article scoring, structured data,
competitor scanning and the old-vs-new benchmark. Built to be run by the owner
through Claude Code. Spawned by \`jeldon init\` on ${new Date().toISOString().slice(0, 10)}.

**Owner? Start with [\`docs/START-HERE.md\`](docs/START-HERE.md).**
**Agent? Start with [\`CLAUDE.md\`](CLAUDE.md).**

## What's here

\`\`\`
kit.config.ts         the website's facts: hours, prices, links, nav, analytics, contact wiring
jeldon.config.ts      the content engine's Domain Pack: brand, author, voice, scoring
src/pages/            one file per page; api/contact.ts is the only server route
src/content/          articles, ${servicesDir.split('/').pop()}, ${teamDir.split('/').pop()}, faqs.json
public/               logo, icons, robots.txt, _redirects (old URLs), _headers
scripts/              workbench tools (competitors, traffic, test-contact, photos)
.claude/commands/     /setup /article /publish /competitors /reddit-ideas /audit /traffic /benchmark /launch /help
docs/                 START-HERE, OWNER-GUIDE, ACCOUNTS, LAUNCH, DESIGN, JELDON, OLD-URLS
data/                 drop folders for Search Console CSVs, scan output, benchmark scorecards
\`\`\`

## Commands

\`\`\`
npm install
npm run dev              # local preview at localhost:4321
npm run build            # production build → dist/
npm run doctor           # engine + site kit wired? what the owner still needs to fill in
npm run score -- src/content/articles/<slug>.md
npm run competitors      # scan competitors → data/competitors/summary.md
npm run benchmark -- --old ${a.business.oldUrl ?? a.business.url} --new <url>
\`\`\`

## Deploy

Cloudflare Workers, connected to this repo. Build command \`npm run build\`,
deploy command \`npm run deploy:cf\`. Secrets live in the Cloudflare dashboard,
never here. See \`docs/ACCOUNTS.md\`.
`, force, report);

  // 9. Count SETUP markers.
  const count = (p: string): number => {
    if (!existsSync(p)) return 0;
    const st = statSync(p);
    if (st.isDirectory()) return readdirSync(p).filter((n) => n !== 'node_modules' && n !== 'dist').reduce((a2, n) => a2 + count(join(p, n)), 0);
    if (!/\.(ts|md|astro|json|mjs)$/.test(p)) return 0;
    return (readFileSync(p, 'utf8').match(/SETUP:/g) ?? []).length;
  };
  report.setupMarkers = count(join(dir, 'kit.config.ts')) + count(join(dir, 'jeldon.config.ts')) + count(join(dir, 'src'));
  return report;
}
