/**
 * Vocabulary. A gym calls them "programs" and "coaches"; a clinic "care" and
 * "providers"; a bike shop "services" and "our team". The kit's page set is
 * written in neutral terms (services / team / primary CTA / clients) and every
 * visible word comes from `kit.labels`. These presets are starting points the
 * init interview confirms — they are data, never engine assumptions.
 */

export interface LabelPair {
  singular: string;
  plural: string;
}

export interface KitLabels {
  /** The things the business sells or offers. */
  services: LabelPair & { /** Sentence intro used on listings. */ lede?: string };
  /** The people. */
  team: LabelPair & { pageTitle?: string };
  /** The one action the site pushes (free class / new patients / book a fitting). */
  primaryCta: { label: string; short: string; /** Sentence used in the footer band. */ pitch?: string; note?: string };
  /** The customer noun. */
  client: LabelPair;
  blog: string;
  /** Members/patients area. Omit to drop the page. */
  members?: string;
  schedule?: string;
  pricing?: string;
  faq?: string;
  about?: string;
  contact?: string;
}

export type VerticalPreset = 'gym' | 'clinic' | 'studio' | 'shop' | 'generic';

export const LABEL_PRESETS: Record<VerticalPreset, KitLabels> = {
  gym: {
    services: { singular: 'Program', plural: 'Programs', lede: 'One coaching philosophy, several ways to train.' },
    team: { singular: 'Coach', plural: 'Coaches', pageTitle: 'Meet the coaches' },
    primaryCta: { label: 'Try a free class', short: 'Free class', pitch: 'Your first class is free.', note: 'No experience needed. No long-term commitment required.' },
    client: { singular: 'member', plural: 'members' },
    blog: 'Blog',
    members: 'Current members',
    schedule: 'Schedule',
    pricing: 'Pricing',
    faq: 'FAQ',
    about: 'About',
    contact: 'Contact',
  },
  clinic: {
    services: { singular: 'Service', plural: 'Care', lede: 'What we treat, and how.' },
    team: { singular: 'Provider', plural: 'Providers', pageTitle: 'Meet the providers' },
    primaryCta: { label: 'Book a new-patient visit', short: 'New patients', pitch: 'New patients are welcome.', note: 'Most insurance accepted. Ask us.' },
    client: { singular: 'patient', plural: 'patients' },
    blog: 'Articles',
    members: 'Current patients',
    schedule: 'Hours',
    pricing: 'Fees & insurance',
    faq: 'FAQ',
    about: 'About',
    contact: 'Contact',
  },
  studio: {
    services: { singular: 'Class', plural: 'Classes', lede: 'Find the class that fits your week.' },
    team: { singular: 'Instructor', plural: 'Instructors', pageTitle: 'Meet the instructors' },
    primaryCta: { label: 'Book an intro class', short: 'Intro class', pitch: 'Your first class is on us.', note: 'All levels welcome.' },
    client: { singular: 'student', plural: 'students' },
    blog: 'Journal',
    members: 'Current students',
    schedule: 'Schedule',
    pricing: 'Pricing',
    faq: 'FAQ',
    about: 'About',
    contact: 'Contact',
  },
  shop: {
    services: { singular: 'Service', plural: 'Services', lede: 'What we do, and what it costs.' },
    team: { singular: 'Team member', plural: 'Our team', pageTitle: 'Meet the team' },
    primaryCta: { label: 'Book a visit', short: 'Book', pitch: 'Come in and talk to a person who knows.', note: 'Walk-ins welcome.' },
    client: { singular: 'customer', plural: 'customers' },
    blog: 'Blog',
    schedule: 'Hours',
    pricing: 'Pricing',
    faq: 'FAQ',
    about: 'About',
    contact: 'Contact',
  },
  generic: {
    services: { singular: 'Service', plural: 'Services', lede: 'What we offer.' },
    team: { singular: 'Team member', plural: 'Team', pageTitle: 'Meet the team' },
    primaryCta: { label: 'Get in touch', short: 'Contact', pitch: 'Ready when you are.', note: '' },
    client: { singular: 'client', plural: 'clients' },
    blog: 'Blog',
    schedule: 'Hours',
    pricing: 'Pricing',
    faq: 'FAQ',
    about: 'About',
    contact: 'Contact',
  },
};

/** Fill a partial label set from a preset. */
export function resolveLabels(preset: VerticalPreset | undefined, overrides: Partial<KitLabels> = {}): KitLabels {
  const base = LABEL_PRESETS[preset ?? 'generic'];
  return {
    ...base,
    ...overrides,
    services: { ...base.services, ...overrides.services },
    team: { ...base.team, ...overrides.team },
    primaryCta: { ...base.primaryCta, ...overrides.primaryCta },
    client: { ...base.client, ...overrides.client },
  };
}
