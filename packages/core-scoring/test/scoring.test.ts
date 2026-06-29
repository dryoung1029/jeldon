import { describe, expect, it } from 'vitest';
import type { GeoConfig } from '@jeldon/config';
import { calculateGeo, calculateSeo, fleschKincaidGrade } from '../src/index.js';

const richArticle = {
  title: 'When should you actually image low back pain?',
  excerpt:
    'Imaging early rarely changes the plan for uncomplicated low back pain. Here is when an x-ray or MRI earns its place — and when it just adds cost and worry.',
  tags: ['back-pain', 'imaging', 'evidence'],
  slug: 'when-to-image-low-back-pain',
  heroImage: '/img/when-to-image-low-back-pain/lumbar-imaging-decision.png',
  heroImageAlt: 'A clinician reviewing a lumbar spine x-ray with a patient',
  body: `When I see a new patient with low back pain, the first question is rarely "do we image?"

## Why imaging early usually does not help

According to Chou et al (2007), routine imaging for acute low back pain does not improve outcomes. In one cohort, 90% of adults over 50 show degenerative changes that are clinically irrelevant.

"Routine imaging is not associated with clinically meaningful benefit" (Chou et al, 2007), and the guideline is unambiguous.

## When do I order an x-ray?

I order imaging when I see red flags: a 6-12 week history with neurological deficit, or trauma. In our clinic, that is fewer than 1 in 20 visits.

## References

Chou et al, 2007. ACP/APS guideline. [PubMed](https://pubmed.ncbi.nlm.nih.gov/17909209/)
`,
};

describe('default (health) scoring', () => {
  it('rates a statistic-dense, attributed, first-person article highly on GEO', () => {
    const geo = calculateGeo(richArticle);
    expect(geo.score).toBeGreaterThanOrEqual(70);
    expect(geo.checks.find((c) => c.label === 'Citation density')?.status).not.toBe('bad');
  });

  it('produces a reasonable SEO score with no bad-blocking issues', () => {
    const seo = calculateSeo(richArticle);
    expect(seo.score).toBeGreaterThan(60);
    expect(seo.checks.find((c) => c.label === 'Hero image')?.status).toBe('good');
  });

  it('computes a Flesch-Kincaid grade', () => {
    const g = fleschKincaidGrade(richArticle.body);
    expect(g).not.toBeNull();
    expect(typeof g).toBe('number');
  });
});

describe('config-driven portability (no engine code changes)', () => {
  it('rewards RFC/CVE citations when the citation check points at non-PubMed sources', () => {
    const devopsGeo: GeoConfig = {
      floor: 68,
      checks: [
        {
          id: 'citation',
          label: 'Citation density',
          weight: 100,
          kind: 'regexPer1k',
          target: 'body',
          patterns: ['datatracker\\.ietf\\.org', 'nvd\\.nist\\.gov', 'github\\.com/.+/issues'],
          flags: 'gi',
          thresholds: [2, 1],
        },
      ],
    };
    const devBody = `We hit this during an incident. Per the postmortem, sampling at 1% lost the signal.
See [RFC 9000](https://datatracker.ietf.org/doc/rfc9000) and the [tracking issue](https://github.com/open-telemetry/opentelemetry-collector/issues/1).`;
    const geo = calculateGeo(
      { title: 't', excerpt: 'e', tags: [], slug: 's', body: devBody },
      devopsGeo,
    );
    // PubMed-tuned default would score this 0 on citations; the DevOps config
    // recognizes RFC/GitHub sources instead. Same engine, different pack.
    expect(geo.score).toBeGreaterThan(0);
  });
});
