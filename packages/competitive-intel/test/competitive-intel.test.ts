import type { GeoConfig } from '@jeldon/config';
import { describe, expect, it } from 'vitest';
import {
  aggregatePriorityKeywords,
  computePageStats,
  detectTemplateVendor,
  geoScoreHtml,
  htmlToScorableMarkdown,
  NullRanksStore,
  resolveScannerConfig,
  trackLocalRanks,
} from '../src/index.js';
import { buildGapReportSystem, buildPositioningSystem } from '../src/prompts.js';
import type { CompetitorAudit, SampledPage } from '../src/index.js';

const HEALTH_HOMEPAGE = `<html><head><title>Corvallis Spine Clinic</title></head><body>
<nav>Home Services Contact</nav>
<h1>Chiropractic care in Corvallis</h1>
<h2>When should you see a chiropractor?</h2>
<p>According to Chou et al (2007), routine imaging for acute low back pain does not improve outcomes — in one cohort 90% of adults over 50 show degenerative changes. "Routine imaging is not associated with clinically meaningful benefit" (Chou et al, 2007). When I see a new patient, I look for red flags. See <a href="https://pubmed.ncbi.nlm.nih.gov/17909209/">the guideline</a>.</p>
<footer>© 2026</footer>
</body></html>`;

describe('geoScoreHtml — reuses @jeldon/core-scoring, default health pack', () => {
  it('scores a statistic-dense, attributed homepage above zero', () => {
    const r = geoScoreHtml(HEALTH_HOMEPAGE);
    expect(r.score).toBeGreaterThan(0);
    expect(typeof r.badCount).toBe('number');
  });

  it('promotes HTML headings to markdown so the question-H2 check fires', () => {
    const md = htmlToScorableMarkdown(HEALTH_HOMEPAGE);
    expect(md).toContain('## When should you see a chiropractor?');
    // Anchor href survives into the body so the citation regex can find it.
    expect(md).toContain('pubmed.ncbi.nlm.nih.gov/17909209');
  });
});

describe('config-driven portability — a different pack changes behavior, no engine change', () => {
  it('scores a DevOps page on RFC/CVE sources when GeoConfig points away from PubMed', () => {
    const devopsGeo: GeoConfig = {
      floor: 60,
      checks: [
        {
          id: 'citation',
          label: 'Citation density',
          weight: 100,
          kind: 'regexPer1k',
          target: 'body',
          patterns: ['datatracker\\.ietf\\.org', 'nvd\\.nist\\.gov'],
          flags: 'gi',
          thresholds: [2, 1],
        },
      ],
    };
    const devHtml = `<html><body><p>Per the postmortem, see
      <a href="https://datatracker.ietf.org/doc/rfc9000">RFC 9000</a> and
      <a href="https://nvd.nist.gov/vuln/detail/CVE-2024-0001">the CVE</a>.</p></body></html>`;
    // The default (PubMed-tuned) citation check would score this 0; the DevOps
    // GeoConfig recognizes RFC/NVD sources instead. Same engine, different pack.
    expect(geoScoreHtml(devHtml, devopsGeo).score).toBeGreaterThan(0);
    expect(geoScoreHtml(HEALTH_HOMEPAGE, devopsGeo).score).toBeLessThan(
      geoScoreHtml(devHtml, devopsGeo).score,
    );
  });

  it('detects a vendor template from config fingerprints — a different pack matches a different vendor', () => {
    const acmeConfig = resolveScannerConfig({
      ourPlaceId: 'x',
      roster: [],
      targetKeywords: [],
      templateVendors: [{ name: 'acme-builder', fingerprints: ['acme-cdn\\.example'] }],
    });
    const acmeHtml = '<html><head><link href="https://acme-cdn.example/app.css"></head><body>hi</body></html>';
    expect(detectTemplateVendor(acmeHtml, [], null, acmeConfig)).toBe('acme-builder');
    // The default health pack's fingerprints do NOT match acme markup.
    expect(detectTemplateVendor(acmeHtml, [], null, resolveScannerConfig())).toBeNull();
  });

  it('flags the built-in generic-template heuristic on a wordy homepage + thin pages', () => {
    const cfg = resolveScannerConfig();
    const thin: SampledPage[] = Array.from({ length: 4 }, (_, i) => ({
      url: `https://x.test/service-${i}`,
      title: 's',
      h1: [],
      h2: [],
      excerpt: '',
      schemaTypes: [],
      wordCount: 100,
      h2Count: 1,
      internalLinks: 2,
      externalLinks: 0,
    }));
    const homepage = { wordCount: 1500 } as CompetitorAudit['homepage'];
    expect(detectTemplateVendor('<html></html>', thin, homepage, cfg)).toBe('generic-template');
  });
});

describe('computePageStats', () => {
  it('aggregates word counts, medians, and thin-page counts', () => {
    const pages: SampledPage[] = [
      { url: 'a', title: null, h1: [], h2: [], excerpt: '', schemaTypes: ['Article'], wordCount: 100, h2Count: 1, internalLinks: 3, externalLinks: 1 },
      { url: 'b', title: null, h1: [], h2: [], excerpt: '', schemaTypes: ['FAQPage'], wordCount: 500, h2Count: 3, internalLinks: 5, externalLinks: 2 },
    ];
    const stats = computePageStats(pages);
    expect(stats?.count).toBe(2);
    expect(stats?.avgWordCount).toBe(300);
    expect(stats?.thinPageCount).toBe(1); // the 100-word page is < 300 floor
    expect(stats?.sitewideSchemaTypes).toEqual(['Article', 'FAQPage']);
  });
});

describe('aggregatePriorityKeywords — pure', () => {
  it('sums competitor weights, drops our own + covered terms, sorts by weight', () => {
    const audits = [
      {
        positioning: {
          generatedAt: '', model: '', marketingSegments: [], differentiators: [], contentThemes: [], summary: '',
          keywords: [
            { phrase: 'spinal decompression', weight: 8, intent: 'commercial' as const },
            { phrase: 'webster technique', weight: 6, intent: 'commercial' as const },
            { phrase: 'sciatica', weight: 4, intent: 'informational' as const },
          ],
        },
      },
      {
        positioning: {
          generatedAt: '', model: '', marketingSegments: [], differentiators: [], contentThemes: [], summary: '',
          keywords: [{ phrase: 'spinal decompression', weight: 5, intent: 'commercial' as const }],
        },
      },
    ] as unknown as CompetitorAudit[];

    const out = aggregatePriorityKeywords({
      competitorAudits: audits,
      ourPositioningKeywords: [{ phrase: 'sciatica' }], // ours → dropped
      covered: (p) => p === 'webster technique', // covered → dropped
    });
    expect(out.map((k) => k.phrase)).toEqual(['spinal decompression']);
    expect(out[0]?.totalWeight).toBe(13); // 8 + 5
  });
});

describe('prompt builders read the Domain Pack, not hardcoded brand', () => {
  const pack = {
    brand: { name: 'Northwatch Security', siteUrl: 'https://northwatch.example', geoFraming: 'the Pacific Northwest' },
    voice: {
      persona: 'A blunt, incident-tested SRE who explains tradeoffs plainly.',
      bannedTopics: ['fearmongering'],
      bannedPhrasings: ['synergy'],
      rules: ['Cite the postmortem.'],
      voiceAnchorUrls: [],
      readingGradeBand: [8, 11] as [number, number],
    },
    content: { categories: ['incident', 'playbook', 'analysis'] },
  };

  it('positioning system names the brand + persona from the pack', () => {
    const sys = buildPositioningSystem(pack);
    expect(sys).toContain('Northwatch Security');
    expect(sys).toContain('the Pacific Northwest');
    expect(sys).toContain('incident-tested SRE');
    expect(sys).not.toContain('Body of Health');
  });

  it('gap-report system uses the pack categories in the section guidance', () => {
    const sys = buildGapReportSystem(pack);
    expect(sys).toContain('incident/playbook/analysis');
    expect(sys).toContain('Cite the postmortem.');
    expect(sys).not.toContain('Corvallis');
  });
});

describe('trackLocalRanks — guards + store wiring (no network)', () => {
  it('throws when no SerpApi/Places key is present', async () => {
    await expect(
      trackLocalRanks({
        keywords: ['chiropractor corvallis'],
        competitors: { ourPlaceId: 'p', roster: [], targetKeywords: [] },
        keys: {},
        store: new NullRanksStore(),
      }),
    ).rejects.toThrow(/serpapi|places/i);
  });

  it('throws when ourPlaceId is missing', async () => {
    await expect(
      trackLocalRanks({
        keywords: ['x'],
        competitors: { roster: [], targetKeywords: [] },
        keys: { serpapi: 'k' },
        store: new NullRanksStore(),
      }),
    ).rejects.toThrow(/ourPlaceId/);
  });
});
