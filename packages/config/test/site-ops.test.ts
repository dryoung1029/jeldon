import { describe, expect, it } from 'vitest';
import {
  defaultScoringConfig,
  defaultSecurityConfig,
  defaultSiteAlertConfig,
  validateDomainPack,
} from '../src/index.js';

const base = {
  brand: { name: 'Example', siteUrl: 'https://example.com' },
  authors: [{ slug: 'a', name: 'A', schemaId: 'https://example.com/#a', profile: { name: 'A' } }],
  voice: { persona: 'p', bannedTopics: [], bannedPhrasings: [], rules: [], voiceAnchorUrls: [], readingGradeBand: [6, 9] },
  content: { categories: ['guide'], categoryTargets: { guide: 85 }, defaultAuthorSlug: 'a', timezone: 'UTC' },
  scoring: defaultScoringConfig,
  citation: { policy: 'direct-source-urls', forbiddenPatterns: [], referenceFormat: 'x', verifier: { kind: 'none' } },
  aeo: {
    brandMentions: ['example'],
    querySet: [{ id: 'q1', query: 'q', tags: [] }],
    engines: ['anthropic'],
    highPriorityTags: [],
  },
  schema: { orgType: ['Organization'], org: { name: 'Example', url: 'https://example.com' }, articleTypes: ['Article'] },
  capabilities: {},
  services: { store: 'fs', requiredEnv: [] },
};

describe('site-ops pack fields', () => {
  it('are optional', () => {
    expect(validateDomainPack(base).ok).toBe(true);
  });

  it('accept a filled contact / hours / places / siteAlert / security block', () => {
    const r = validateDomainPack({
      ...base,
      brand: {
        ...base.brand,
        contact: { email: 'hello@example.com', phoneDisplay: '(555) 010-0000' },
        hours: {
          regular: [{ day: 'Monday', intervals: [{ opens: '08:00', closes: '17:30' }] }],
          special: [{ date: '2026-12-25', intervals: [] }],
        },
      },
      services: { ...base.services, places: { apiKeyEnv: 'PLACES_KEY', placeIdEnv: 'PLACES_ID' } },
      siteAlert: {
        ...defaultSiteAlertConfig,
        presets: { closed: { name: 'Closed today', title: 'Closed today', message: 'Email {email}.' } },
      },
      security: { ...defaultSecurityConfig, access: { teamDomain: 'team.cloudflareaccess.com', aud: 'abc' } },
      capabilities: { siteAlert: true, businessHours: true },
    });
    expect(r.errors).toEqual([]);
  });

  it('reject malformed hours, a bad contact email and relative admin prefixes', () => {
    const bad = validateDomainPack({
      ...base,
      brand: {
        ...base.brand,
        contact: { email: 'not-an-email' },
        hours: { regular: [{ day: 'Monday', intervals: [{ opens: '8am', closes: '25:00' }] }] },
      },
      security: { adminPrefixes: ['admin'] },
    });
    expect(bad.ok).toBe(false);
    const paths = bad.errors.map((e) => e.path);
    expect(paths).toContain('brand.contact.email');
    expect(paths.some((p) => p.startsWith('brand.hours.regular.0.intervals.0'))).toBe(true);
    expect(paths).toContain('security.adminPrefixes.0');
  });

  it('defaults carry no access application, so protection fails closed until configured', () => {
    expect(defaultSecurityConfig.access).toBeUndefined();
    expect(defaultSiteAlertConfig.presets).toEqual({});
  });
});
