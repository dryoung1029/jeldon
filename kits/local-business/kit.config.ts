/**
 * KIT CONFIG — everything about the WEBSITE that is not the content engine:
 * routes, vocabulary, hours, pricing, booking links, social links, analytics
 * IDs, the contact-form wiring. Pages read from here so there is one place to
 * change a phone number or a price. `jeldon.config.ts` owns brand/voice/scoring.
 *
 * PLAIN DATA ONLY — the single import below is type-only (erased at build), so
 * this file bundles into the contact-form Worker with no Node code. Keep the
 * business name / URL / phone in sync with jeldon.config.ts (the wizard edits both).
 *
 * Values marked `SETUP:` are placeholders the /setup wizard fills with the owner.
 */
import type { KitConfig } from '@jeldon/kit-local-business';

export const kit: KitConfig = {
  vertical: 'generic',
  labels: {},
  routes: {
    services: '/services/',
    team: '/team/',
    pricing: '/pricing/',
    schedule: '/schedule/',
    contact: '/contact/',
    primaryCta: '/get-started/',
    blog: '/articles/', // must equal content.articlePathPrefix in jeldon.config.ts
    faq: '/faq/',
    about: '/about/',
    members: '/members/',
    privacy: '/privacy/',
    terms: '/terms/',
    thanks: '/thanks/',
  },
  collections: {
    services: 'src/content/services',
    team: 'src/content/team',
    faqs: 'src/content/faqs.json',
  },

  site: {
    name: 'TODO Project Name', // SETUP: business name exactly as the owner writes it
    url: 'https://example.com', // SETUP: canonical host (no trailing slash)
    tagline: 'TODO one-line positioning', // SETUP
    shortPitch: 'TODO one sentence about the business and where it is.', // SETUP
    phone: '', // SETUP: E.164, e.g. +1-541-555-0100
    phoneDisplay: '', // SETUP: as shown, e.g. (541) 555-0100
    email: '', // SETUP: the inbox that should get website messages
    address: {
      street: '', // SETUP
      city: '', // SETUP
      region: '', // SETUP
      postalCode: '', // SETUP
      landmark: '', // SETUP: "Same building as …"
      mapsUrl: '', // SETUP: Google Maps share link
      mapsEmbedUrl: '', // SETUP: Google Maps embed src
    },
    hours: { Mon: '', Tue: '', Wed: '', Thu: '', Fri: '', Sat: '', Sun: '' }, // SETUP: "5:30 AM – 7:00 PM" per day
    hoursConfirmed: false, // SETUP: the wizard flips this once the owner confirms
    social: { facebook: '', instagram: '' }, // SETUP
    logo: '/brand/logo.svg',
    ogImage: '/brand/og-default.jpg',
    heroKicker: '', // SETUP: e.g. the city
    heroTitle: 'TODO the one-line promise', // SETUP
    heroLede: 'TODO two sentences on who this is for and why it is different.', // SETUP
    pillars: [], // SETUP: three { title, text } reasons
    steps: [], // SETUP: three { title, text } steps to get started
    quote: '', // SETUP: one real sentence from the owner
  },

  theme: { primary: 'primary', accent: 'accent', neutral: 'neutral', highlight: 'highlight' },

  nav: [
    { label: 'Services', href: '/services/' },
    { label: 'Pricing', href: '/pricing/' },
    { label: 'Team', href: '/team/' },
    { label: 'Articles', href: '/articles/' },
    { label: 'Contact', href: '/contact/' },
  ],
  primaryCta: { label: 'Get in touch', href: '/get-started/' },

  booking: {
    kind: 'none', // SETUP: pushpress | iframe | link | none
    calendarUrl: '',
    plans: {},
    timezone: 'America/Los_Angeles',
  },

  pricing: [], // SETUP: [{ name, price, period, note, planKey, featured }]
  pricingNote: '',

  analytics: {
    cloudflareToken: '', // SETUP (Cloudflare → Web Analytics)
    googleSiteVerification: '', // carried over from the old site when it had one
    ga4MeasurementId: '', // leave blank to skip GA entirely
  },

  contact: {
    leadSink: 'none', // SETUP: pushpress | gohighlevel | brevo-contact | none
    notifier: 'none', // SETUP: brevo | resend | none
    subjects: ['General question', 'Booking', 'Pricing', 'Something else'],
    turnstileSiteKey: '', // optional spam shield; secret goes in Cloudflare
    hint: '',
  },

  copy: {
    footerCtaTitle: 'Ready when you are.',
    footerCtaText: 'Ask a question or come by. A real person replies.',
    notFoundTitle: 'That page moved or never existed.',
    notFoundText: 'Here is where to go instead.',
  },
};

export default kit;
