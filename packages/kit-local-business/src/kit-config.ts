/**
 * The Kit Config (`kit.config.ts`) — everything about the WEBSITE that is not
 * the content engine: routes, labels, hours, pricing, booking links, social
 * links, analytics IDs, the contact-form wiring. The Domain Pack
 * (`jeldon.config.ts`) owns brand/voice/scoring; this owns the site.
 *
 * It must stay PLAIN DATA — a consumer's `kit.config.ts` uses only a
 * type-only import, so the file bundles into the contact-form Worker with no
 * Node code. `kitConfigSchema` validates it (init + doctor); `defineKitConfig`
 * is an identity helper for authoring.
 */
import { z } from 'zod';
import type { KitLabels, VerticalPreset } from './labels.js';

export type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export const DAY_KEYS: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type LeadSinkKind = 'pushpress' | 'gohighlevel' | 'brevo-contact' | 'none';
export type NotifierKind = 'brevo' | 'resend' | 'none';
export type BookingKind = 'pushpress' | 'iframe' | 'link' | 'none';

export interface KitRoutes {
  services: string;
  team: string;
  pricing: string;
  schedule: string;
  contact: string;
  primaryCta: string;
  /** Must equal `content.articlePathPrefix` in jeldon.config.ts. */
  blog: string;
  faq: string;
  about: string;
  members: string;
  privacy: string;
  terms: string;
  thanks: string;
}

export interface PricingRow {
  name: string;
  price: string;
  period: string;
  note?: string;
  /** Key into `booking.plans`, or blank → contact form. */
  planKey?: string;
  featured?: boolean;
}

export interface KitConfig {
  /** Vertical vocabulary preset; `labels` overrides any word. */
  vertical: VerticalPreset;
  labels?: Partial<KitLabels>;
  routes: KitRoutes;
  /** Content dirs (relative to the project root). Collection NAMES stay
   *  services/team/faqs/articles regardless of the words on the page. */
  collections: { services: string; team: string; faqs: string };

  site: {
    name: string;
    url: string;
    tagline?: string;
    /** One-sentence description used in the footer + meta fallbacks. */
    shortPitch?: string;
    phone?: string;
    phoneDisplay?: string;
    email?: string;
    address?: {
      street?: string;
      city?: string;
      region?: string;
      postalCode?: string;
      landmark?: string;
      mapsUrl?: string;
      mapsEmbedUrl?: string;
    };
    /** Day → 'H:MM AM – H:MM PM' or '' (closed / not set). */
    hours?: Partial<Record<DayKey, string>>;
    /** Pages show hours only once the owner has confirmed them. */
    hoursConfirmed?: boolean;
    social?: Partial<Record<'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'x' | 'yelp' | 'google', string>>;
    /** Logo path under public/. */
    logo?: string;
    ogImage?: string;
    /** Short line at the very top of the hero (e.g. the city). */
    heroKicker?: string;
    heroTitle?: string;
    heroLede?: string;
    /** Three short "why us" pillars on the home page. */
    pillars?: Array<{ title: string; text: string }>;
    /** Three-step "how to start" list on the home page. */
    steps?: Array<{ title: string; text: string }>;
    quote?: string;
  };

  /** Design roles → keys in `brand.brandColors` (jeldon.config.ts), or raw hex. */
  theme?: {
    primary?: string;
    accent?: string;
    neutral?: string;
    highlight?: string;
    /** Google Fonts family name for display + body (one family by convention). */
    fontFamily?: string;
  };

  nav: Array<{ label: string; href: string }>;
  primaryCta: { label: string; href: string };

  booking: {
    kind: BookingKind;
    /** Hosted calendar / booking page (PushPress, Mindbody, Jane…). */
    calendarUrl?: string;
    /** Embed URL for `iframe` (or PushPress `?framed=1`). */
    embedUrl?: string;
    /** PushPress subdomain (the part before .pushpress.com). */
    pushpressSubdomain?: string;
    /** Named hosted checkout links, referenced by services + pricing. */
    plans?: Record<string, string>;
    /** Third-party widgets already in use. */
    widgets?: { reviewWidgetUrl?: string; pricingFormUrl?: string };
    memberApp?: { ios?: string; android?: string };
    timezone?: string;
  };

  pricing?: PricingRow[];
  pricingNote?: string;

  analytics?: {
    cloudflareToken?: string;
    googleSiteVerification?: string;
    ga4MeasurementId?: string;
  };

  contact: {
    leadSink: LeadSinkKind;
    notifier: NotifierKind;
    subjects: string[];
    turnstileSiteKey?: string;
    /** Hint under the message box. HIPAA packs override this. */
    hint?: string;
    /** GoHighLevel inbound webhook URL (PushPress Grow). */
    goHighLevelWebhookUrl?: string;
  };

  /** Vertical-neutral copy the pages need. */
  copy?: {
    articleDisclaimer?: string;
    footerCtaTitle?: string;
    footerCtaText?: string;
    notFoundTitle?: string;
    notFoundText?: string;
  };
}

const route = z.string().regex(/^\/(?:[a-z0-9-]+\/)*$/, 'route must look like /segment/');

export const kitConfigSchema = z.object({
  vertical: z.enum(['gym', 'clinic', 'studio', 'shop', 'generic']),
  labels: z.record(z.unknown()).optional(),
  routes: z.object({
    services: route, team: route, pricing: route, schedule: route, contact: route, primaryCta: route,
    blog: route, faq: route, about: route, members: route, privacy: route, terms: route, thanks: route,
  }),
  collections: z.object({ services: z.string(), team: z.string(), faqs: z.string() }),
  site: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    tagline: z.string().optional(),
    shortPitch: z.string().optional(),
    phone: z.string().optional(),
    phoneDisplay: z.string().optional(),
    email: z.string().optional(),
    address: z.object({
      street: z.string().optional(), city: z.string().optional(), region: z.string().optional(),
      postalCode: z.string().optional(), landmark: z.string().optional(), mapsUrl: z.string().optional(), mapsEmbedUrl: z.string().optional(),
    }).optional(),
    hours: z.record(z.string()).optional(),
    hoursConfirmed: z.boolean().optional(),
    social: z.record(z.string()).optional(),
    logo: z.string().optional(),
    ogImage: z.string().optional(),
    heroKicker: z.string().optional(),
    heroTitle: z.string().optional(),
    heroLede: z.string().optional(),
    pillars: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
    steps: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
    quote: z.string().optional(),
  }),
  theme: z.object({
    primary: z.string().optional(), accent: z.string().optional(), neutral: z.string().optional(),
    highlight: z.string().optional(), fontFamily: z.string().optional(),
  }).optional(),
  nav: z.array(z.object({ label: z.string(), href: z.string() })).max(7),
  primaryCta: z.object({ label: z.string(), href: z.string() }),
  booking: z.object({
    kind: z.enum(['pushpress', 'iframe', 'link', 'none']),
    calendarUrl: z.string().optional(),
    embedUrl: z.string().optional(),
    pushpressSubdomain: z.string().optional(),
    plans: z.record(z.string()).optional(),
    widgets: z.object({ reviewWidgetUrl: z.string().optional(), pricingFormUrl: z.string().optional() }).optional(),
    memberApp: z.object({ ios: z.string().optional(), android: z.string().optional() }).optional(),
    timezone: z.string().optional(),
  }),
  pricing: z.array(z.object({
    name: z.string(), price: z.string(), period: z.string(), note: z.string().optional(),
    planKey: z.string().optional(), featured: z.boolean().optional(),
  })).optional(),
  pricingNote: z.string().optional(),
  analytics: z.object({
    cloudflareToken: z.string().optional(), googleSiteVerification: z.string().optional(), ga4MeasurementId: z.string().optional(),
  }).optional(),
  contact: z.object({
    leadSink: z.enum(['pushpress', 'gohighlevel', 'brevo-contact', 'none']),
    notifier: z.enum(['brevo', 'resend', 'none']),
    subjects: z.array(z.string()).min(1),
    turnstileSiteKey: z.string().optional(),
    hint: z.string().optional(),
    goHighLevelWebhookUrl: z.string().optional(),
  }),
  copy: z.object({
    articleDisclaimer: z.string().optional(), footerCtaTitle: z.string().optional(), footerCtaText: z.string().optional(),
    notFoundTitle: z.string().optional(), notFoundText: z.string().optional(),
  }).optional(),
});

export interface KitValidateResult {
  ok: boolean;
  data?: KitConfig;
  errors: Array<{ path: string; message: string }>;
}

export function validateKitConfig(input: unknown): KitValidateResult {
  const parsed = kitConfigSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data as unknown as KitConfig, errors: [] };
  return { ok: false, errors: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })) };
}

/** Identity helper for type-safe authoring. Type-only cost at runtime. */
export function defineKitConfig(kit: KitConfig): KitConfig {
  return kit;
}

/** Default neutral routes (the kit directory's file layout). */
export const DEFAULT_ROUTES: KitRoutes = {
  services: '/services/', team: '/team/', pricing: '/pricing/', schedule: '/schedule/', contact: '/contact/',
  primaryCta: '/get-started/', blog: '/articles/', faq: '/faq/', about: '/about/', members: '/members/',
  privacy: '/privacy/', terms: '/terms/', thanks: '/thanks/',
};

/** Count `SETUP:` markers in a string — the "still needs the owner" signal. */
export function countSetupMarkers(source: string): number {
  return (source.match(/SETUP:/g) ?? []).length;
}
