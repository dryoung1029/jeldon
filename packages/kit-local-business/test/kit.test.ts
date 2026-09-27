import { describe, expect, it } from 'vitest';
import {
  buildGlobalCss, complianceCopy, contrastRatio, openingHoursSpec, planRedirects, processContact, renderOldUrlsDoc,
  renderRedirectsFile, resolveBooking, resolveLabels, resolveTheme, validateKitConfig, bookingVendorOf, DEFAULT_ROUTES,
  type KitConfig, type LeadSink, type Notifier,
} from '../src/index.js';

const helixRoutes = { ...DEFAULT_ROUTES, services: '/programs/', team: '/coaches/', primaryCta: '/free-class/', blog: '/blog/' };

const kit: KitConfig = {
  vertical: 'gym',
  routes: helixRoutes,
  collections: { services: 'src/content/programs', team: 'src/content/coaches', faqs: 'src/content/faqs.json' },
  site: { name: 'Helix Training', url: 'https://helixtrain.com', phoneDisplay: '(541) 286-7850', email: 'kathy@helixtrain.com' },
  nav: [{ label: 'Programs', href: '/programs/' }],
  primaryCta: { label: 'Try a Free Class', href: '/free-class/' },
  booking: { kind: 'pushpress', pushpressSubdomain: 'helixtraining', plans: { freeClass: 'https://helixtraining.pushpress.com/landing/plans/x/login' } },
  contact: { leadSink: 'pushpress', notifier: 'brevo', subjects: ['Free class', 'Something else'] },
};

describe('kit config + labels', () => {
  it('validates the Helix-shaped kit config', () => {
    expect(validateKitConfig(kit).ok).toBe(true);
    expect(validateKitConfig({ ...kit, routes: { ...kit.routes, blog: 'blog' } }).ok).toBe(false);
  });
  it('resolves vocabulary from a preset with overrides — a clinic is not a gym', () => {
    const gym = resolveLabels('gym');
    const clinic = resolveLabels('clinic', { team: { singular: 'Doctor', plural: 'Doctors' } });
    expect(gym.services.plural).toBe('Programs');
    expect(gym.client.plural).toBe('members');
    expect(clinic.services.plural).toBe('Care');
    expect(clinic.team.plural).toBe('Doctors');
    expect(clinic.team.pageTitle).toBe('Meet the providers'); // untouched preset field kept
    expect(clinic.client.plural).toBe('patients');
  });
});

describe('design tokens from the Domain Pack', () => {
  it('maps brand color roles to CSS custom properties with derived shades and a dark scheme', () => {
    const css = buildGlobalCss({
      brandColors: { blue: '#008abd', red: '#ec222d', charcoal: '#333537', salmon: '#f08a7a' },
      fonts: { display: 'Nunito', googleFontsHref: 'https://fonts.googleapis.com/css2?family=Nunito' },
      theme: { primary: 'blue', accent: 'red', neutral: 'charcoal', highlight: 'salmon' },
    });
    expect(css).toContain('--primary: #008abd');
    expect(css).toContain('--accent: #ec222d');
    expect(css).toContain("--font: 'Nunito'");
    expect(css).toMatch(/--primary-deep: #[0-9a-f]{6}/);
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain('.btn--primary { background: var(--accent)');
    const t = resolveTheme({ brandColors: { blue: '#008abd' }, theme: { primary: 'blue' } });
    expect(contrastRatio('#ffffff', t.primaryDeep)!).toBeGreaterThan(4); // button text stays legible
  });
  it('falls back to sane defaults when a pack has no brandColors', () => {
    expect(buildGlobalCss({})).toContain('--primary: #1f6feb');
  });
});

describe('hours → schema.org', () => {
  it('parses "5:30 AM – 7:00 PM" style ranges and skips blank days', () => {
    const spec = openingHoursSpec({ Mon: '5:30 AM – 7:00 PM', Tue: '', Sat: '8 AM - 11 AM' });
    expect(spec).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '05:30', closes: '19:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '08:00', closes: '11:00' },
    ]);
  });
});

describe('booking adapters', () => {
  it('pushpress → API + framed calendar; recognizes vendors by host', () => {
    const b = resolveBooking(kit);
    expect(b.calendarUrl).toBe('https://helixtraining.pushpress.com/landing/calendar');
    expect(b.embedUrl).toContain('?framed=1');
    expect(b.supportsBuildTimeClasses).toBe(true);
    expect(bookingVendorOf('https://helixtraining.pushpress.com/landing/plans/x')).toBe('pushpress');
    expect(bookingVendorOf('https://acme.janeapp.com/')).toBe('jane');
    expect(bookingVendorOf('https://example.com')).toBeNull();
  });
});

describe('redirect generator', () => {
  const oldUrls = [
    'https://www.helixtrain.com',
    'https://www.helixtrain.com/blog-helix-training-in-corvallis-or',
    'https://www.helixtrain.com/membership-pricing-request',
    'https://www.helixtrain.com/coach-bio-request',
    'https://www.helixtrain.com/programs/get-started',
    'https://www.helixtrain.com/programs/community-strength-classes',
    'https://www.helixtrain.com/hsa-fsa',
    'https://www.helixtrain.com/something-weird',
    'https://www.helixtrain.com/privacy-policy',
  ];
  it('maps by override, service slug, heuristic, then fallback; renders both files from one plan', () => {
    const plan = planRedirects(oldUrls, {
      routes: helixRoutes,
      overrides: { '/programs/get-started': '/free-class/' },
      serviceSlugMap: { 'community-strength-classes': 'group-strength-classes' },
    });
    const to = Object.fromEntries(plan.rules.map((r) => [r.from, r.to]));
    expect(to['/blog-helix-training-in-corvallis-or']).toBe('/blog/');
    expect(to['/membership-pricing-request']).toBe('/pricing/');
    expect(to['/coach-bio-request']).toBe('/coaches/');
    expect(to['/programs/get-started']).toBe('/free-class/');
    expect(to['/programs/community-strength-classes']).toBe('/programs/group-strength-classes/');
    expect(to['/hsa-fsa']).toBe('/pricing/');
    expect(to['/privacy-policy']).toBe('/privacy/');
    expect(to['/something-weird']).toBe('/');
    expect(plan.unmatched).toEqual(['/something-weird']);
    const file = renderRedirectsFile(plan);
    expect(file).toContain('/membership-pricing-request /pricing/ 301');
    const doc = renderOldUrlsDoc(plan, { oldHost: 'www.helixtrain.com', today: '2026-09-27' });
    expect(doc).toContain('| /membership-pricing-request, /hsa-fsa | /pricing/ |');
    expect(doc).toContain('## Review these');
  });
});

describe('contact handler', () => {
  const okSink: LeadSink = { kind: 'pushpress', configured: () => true, async send() { return { ok: true, id: 'c1' }; } };
  const okMail: Notifier = { kind: 'brevo', configured: () => true, async send() { return { ok: true }; } };
  const form = (over: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ name: 'Pat Doe', email: 'pat@example.com', phone: '', subject: 'Free class', message: 'Hi there', page: '/contact/', ...over })) f.set(k, v);
    return f;
  };
  const headers = new Headers();

  it('accepts a valid submission and redirects to thanks', async () => {
    const o = await processContact(form(), headers, {}, { kit, leadSink: okSink, notifier: okMail });
    expect(o.status).toBe(200);
    expect(o.redirect).toBe('/thanks/');
    expect(o.lead?.id).toBe('c1');
  });
  it('honeypot short-circuits as success; bad input is 400', async () => {
    expect((await processContact(form({ website: 'spam' }), headers, {}, { kit, leadSink: okSink, notifier: okMail })).status).toBe(200);
    expect((await processContact(form({ email: 'nope' }), headers, {}, { kit, leadSink: okSink, notifier: okMail })).status).toBe(400);
  });
  it('answers an honest 503 with the phone/email when nothing is configured', async () => {
    const o = await processContact(form(), headers, {}, { kit: { ...kit, contact: { ...kit.contact, leadSink: 'none', notifier: 'none' } } });
    expect(o.status).toBe(503);
    expect(o.error).toContain('(541) 286-7850');
    expect(o.error).toContain('kathy@helixtrain.com');
  });
  it('a duplicate CRM contact is not a failure; a failed lead with mail ok is still 200', async () => {
    const dupSink: LeadSink = { kind: 'pushpress', configured: () => true, async send() { return { ok: true, error: 'existing customer' }; } };
    expect((await processContact(form(), headers, {}, { kit, leadSink: dupSink, notifier: okMail })).status).toBe(200);
    const badSink: LeadSink = { kind: 'pushpress', configured: () => true, async send() { return { ok: false, error: '500' }; } };
    expect((await processContact(form(), headers, {}, { kit, leadSink: badSink, notifier: okMail })).status).toBe(200);
  });
  it('never guesses a recipient: brevo notifier is unconfigured without both addresses', async () => {
    const { brevoNotifier } = await import('../src/index.js');
    expect(brevoNotifier.configured({ BREVO_API_KEY: 'k' })).toBe(false);
    expect(brevoNotifier.configured({ BREVO_API_KEY: 'k', LEAD_NOTIFY_TO: 'a@b.c', LEAD_NOTIFY_FROM: 'w@b.c' })).toBe(true);
  });
});

describe('compliance is the one place the kit reads the pack', () => {
  it('hipaa gets the no-health-details copy; none gets neutral copy', () => {
    expect(complianceCopy('hipaa').contactHint).toMatch(/do not include health details/i);
    expect(complianceCopy('hipaa').privacyHealthSection?.text).toMatch(/BAA/);
    expect(complianceCopy('none').contactHint).toBe('');
    expect(complianceCopy('none', { contactHint: 'Say hi.' }).contactHint).toBe('Say hi.');
  });
});
