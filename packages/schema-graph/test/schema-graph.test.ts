import { describe, expect, it } from 'vitest';
import type { DomainPack, OrgProfile, PersonProfile } from '@jeldon/config';
import {
  articleGraph,
  breadcrumbList,
  extractFaqs,
  faqPage,
  organizationGraph,
  personGraph,
  renderLlmsTxt,
  sitemapExcludedArticleUrls,
  websiteGraph,
  type ArticleInput,
  type AuthorEntry,
} from '../src/index.js';

const SITE = 'https://example.com';

describe('extractFaqs (verbatim port)', () => {
  it('pulls question H2s + their first paragraph and strips markdown', () => {
    const body = [
      '## When do I order an x-ray?',
      'I order imaging for [red flags](https://example.com/flags) like **trauma**.',
      '',
      'A second paragraph that should be ignored.',
      '',
      '## Notes',
      'Not a question, skipped.',
    ].join('\n');
    const faqs = extractFaqs(body);
    expect(faqs).toHaveLength(1);
    expect(faqs[0]!.q).toBe('When do I order an x-ray?');
    expect(faqs[0]!.a).toBe('I order imaging for red flags like trauma.');
  });

  it('faqPage wraps pairs into FAQPage JSON-LD', () => {
    const page = faqPage([{ q: 'Why?', a: 'Because.' }]) as Record<string, any>;
    expect(page['@type']).toBe('FAQPage');
    expect(page.mainEntity[0].acceptedAnswer.text).toBe('Because.');
  });
});

describe('breadcrumbList', () => {
  it('resolves relative crumb paths against siteUrl', () => {
    const bc = breadcrumbList(
      [
        { name: 'Home', url: '/' },
        { name: 'Articles', url: '/articles' },
        { name: 'Already absolute', url: 'https://other.test/x' },
      ],
      SITE,
    ) as Record<string, any>;
    expect(bc.itemListElement[0].item).toBe('https://example.com/');
    expect(bc.itemListElement[1].item).toBe('https://example.com/articles');
    expect(bc.itemListElement[2].item).toBe('https://other.test/x');
    expect(bc.itemListElement[1].position).toBe(2);
  });
});

const orgInput = (orgType: string[], org: OrgProfile) => ({
  orgType,
  org,
  siteUrl: SITE,
  nap: { address: '1 Main St', city: 'Townsville', region: 'OR', postalCode: '97000', phone: '+1-555-0100' },
  tagline: 'Feel better.',
});

describe('organizationGraph — config-driven @type + extra merge', () => {
  it('generic Organization by default, with NAP + sameAs', () => {
    const node = organizationGraph(
      orgInput(['Organization'], { name: 'Acme', url: SITE, logoUrl: `${SITE}/logo.png`, sameAs: [`${SITE}/x`] }),
    ) as Record<string, any>;
    expect(node['@type']).toBe('Organization');
    expect(node['@id']).toBe('https://example.com/#org');
    expect(node.address['@type']).toBe('PostalAddress');
    expect(node.address.streetAddress).toBe('1 Main St');
    expect(node.telephone).toBe('+1-555-0100');
    expect(node.slogan).toBe('Feel better.');
    expect(node.sameAs).toEqual([`${SITE}/x`]);
  });

  it('vertical pack stacks types + arbitrary schema.org fields via extra — no engine change', () => {
    const node = organizationGraph(
      orgInput(['MedicalBusiness', 'MedicalClinic'], {
        name: 'Clinic',
        url: SITE,
        extra: {
          medicalSpecialty: ['Chiropractic'],
          award: ['Best of the Valley 2025'],
          areaServed: [{ '@type': 'City', name: 'Corvallis, OR' }],
        },
      }),
    ) as Record<string, any>;
    expect(node['@type']).toEqual(['MedicalBusiness', 'MedicalClinic']);
    expect(node.medicalSpecialty).toEqual(['Chiropractic']);
    expect(node.award).toEqual(['Best of the Valley 2025']);
    expect(node.areaServed[0].name).toBe('Corvallis, OR');
  });

  it('websiteGraph links to the org by @id', () => {
    const node = websiteGraph(orgInput(['Organization'], { name: 'Acme', url: SITE })) as Record<string, any>;
    expect(node['@type']).toBe('WebSite');
    expect(node.publisher['@id']).toBe('https://example.com/#org');
  });
});

describe('personGraph', () => {
  it('generic Person by default; vertical Physician fields via extra', () => {
    const profile: PersonProfile = {
      name: 'Dr. Jane Doe',
      jobTitle: 'Founder',
      knowsAbout: ['Chiropractic'],
      alumniOf: ['University of Western States'],
      awards: ['Award 1'],
      sameAs: ['https://linkedin.com/in/jane'],
      extra: { honorificSuffix: 'DC', medicalSpecialty: 'Chiropractic' },
    };
    const node = personGraph({
      schemaId: `${SITE}/team/jane#person`,
      profile,
      siteUrl: SITE,
      type: ['Person', 'Physician'],
    }) as Record<string, any>;
    expect(node['@type']).toEqual(['Person', 'Physician']);
    expect(node['@id']).toBe(`${SITE}/team/jane#person`);
    expect(node.alumniOf[0]['@type']).toBe('CollegeOrUniversity');
    expect(node.award).toEqual(['Award 1']);
    expect(node.worksFor['@id']).toBe('https://example.com/#org');
    expect(node.honorificSuffix).toBe('DC');
  });
});

const article: ArticleInput = {
  title: 'When to image low back pain',
  slug: 'when-to-image',
  excerpt: 'A short excerpt.',
  publishDate: '2026-01-02',
  updatedDate: '2026-02-03',
  category: 'evidence',
  categoryLabel: 'Evidence',
  author: 'Dr. Jane Doe',
  authorSlug: 'jane',
  tags: ['back-pain', 'imaging'],
  heroImage: '/img/when-to-image/hero.png',
  heroImageAlt: 'A clinician reviewing an x-ray',
  sourceEpisode: 'https://yt.test/watch?v=abc',
};

const authors: AuthorEntry[] = [{ slug: 'jane', name: 'Dr. Jane Doe', schemaId: `${SITE}/team/jane#person` }];

describe('articleGraph — generic by default, YMYL via policy', () => {
  it('generic Article: links author + publisher by @id, no medical-review fields', () => {
    const node = articleGraph(article, authors, {
      siteUrl: SITE,
      articleTypes: ['Article'],
    }) as Record<string, any>;
    expect(node['@type']).toBe('Article');
    expect(node.author['@id']).toBe(`${SITE}/team/jane#person`);
    expect(node.publisher['@id']).toBe('https://example.com/#org');
    expect(node.mainEntityOfPage).toBe('https://example.com/articles/when-to-image/');
    expect(node.dateModified).toContain('2026-02-03');
    expect(node.reviewedBy).toBeUndefined();
    expect(node.image['@type']).toBe('ImageObject');
    expect(node.image.url).toBe('https://example.com/img/when-to-image/hero.png');
  });

  it('YMYL pack: same engine emits reviewedBy + lastReviewed + publishingPrinciples + isBasedOn', () => {
    const node = articleGraph(article, authors, {
      siteUrl: SITE,
      articleTypes: ['Article', 'MedicalWebPage'],
      schemaPolicy: {
        reviewerSchemaId: `${SITE}/team/jane#person`,
        publishingPrinciplesUrl: `${SITE}/editorial-standards`,
        heroImageDimensions: { width: 1200, height: 1500 },
        sourceEpisodeSeriesName: 'PTCH Podcast',
      },
    }) as Record<string, any>;
    expect(node['@type']).toEqual(['Article', 'MedicalWebPage']);
    expect(node.reviewedBy['@id']).toBe(`${SITE}/team/jane#person`);
    expect(node.lastReviewed).toBe('2026-02-03');
    expect(node.publishingPrinciples).toBe(`${SITE}/editorial-standards`);
    expect(node.image.width).toBe(1200);
    expect(node.isBasedOn.partOfSeries.name).toBe('PTCH Podcast');
  });

  it('falls back to an inline Person when the author slug is unknown', () => {
    const node = articleGraph({ ...article, authorSlug: 'stranger', author: 'A Stranger' }, authors, {
      siteUrl: SITE,
    }) as Record<string, any>;
    expect(node.author['@type']).toBe('Person');
    expect(node.author.url).toBe('https://example.com/team/stranger');
  });
});

describe('sitemapExcludedArticleUrls', () => {
  it('excludes only draft/stub article URLs, resolved against siteUrl', () => {
    const set = sitemapExcludedArticleUrls(
      [
        { slug: 'live-one', isDraft: false },
        { slug: 'stub-one', isDraft: true },
      ],
      SITE,
    );
    expect(set.has('https://example.com/articles/stub-one/')).toBe(true);
    expect(set.has('https://example.com/articles/live-one/')).toBe(false);
  });
});

describe('renderLlmsTxt — content is config', () => {
  it('renders H1 + summary + sections with link bullets', () => {
    const txt = renderLlmsTxt({
      brandName: 'Acme Clinic',
      summary: 'A clinic.',
      intro: 'Acme publishes evidence-informed articles.',
      sections: [
        {
          heading: 'Most-cited content',
          items: [{ label: 'Back pain', url: `${SITE}/conditions/back-pain`, note: 'evidence-based care' }],
        },
      ],
    });
    expect(txt).toContain('# Acme Clinic');
    expect(txt).toContain('> A clinic.');
    expect(txt).toContain('## Most-cited content');
    expect(txt).toContain('- [Back pain](https://example.com/conditions/back-pain): evidence-based care');
  });
});

describe('emitLlmsTxt gating (uses a typed pack slice)', () => {
  it('returns emitted=false when the pack opts out', async () => {
    const { emitLlmsTxt } = await import('../src/index.js');
    const pack = {
      brand: { name: 'Acme', siteUrl: SITE },
      schema: { org: { name: 'Acme', url: SITE }, emitLlmsTxt: false },
    } as unknown as DomainPack;
    const res = await emitLlmsTxt(pack);
    expect(res.emitted).toBe(false);
    expect(res.contents).toBe('');
  });
});
