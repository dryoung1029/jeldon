import { describe, expect, it } from 'vitest';
import type { CitationConfig } from '@jeldon/config';
import {
  Cite8Verifier,
  NullVerifier,
  PrimarySourceVerifier,
  createVerifier,
  defaultCitationConfig,
  lintCitations,
  type HttpClient,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Linter — the citation.policy enum resolves the lint-vs-cite8 contradiction
// ---------------------------------------------------------------------------

const md = `Routine imaging rarely helps (PMID: 17909209). See also 10.1001/jama.2017.3086.`;

describe('lintCitations', () => {
  it('flags forbidden PMID/DOI patterns under search-urls-only policy', () => {
    const res = lintCitations(md, defaultCitationConfig, 'foo.md');
    expect(res.ok).toBe(false);
    // one PMID hit + one DOI hit
    expect(res.findings.length).toBe(2);
    expect(res.findings.every((f) => f.file === 'foo.md')).toBe(true);
    expect(res.findings.some((f) => /PMID/i.test(f.hit))).toBe(true);
  });

  it('is a no-op under direct-source-urls policy (same input, different pack)', () => {
    const directPolicy: CitationConfig = {
      ...defaultCitationConfig,
      policy: 'direct-source-urls',
      verifier: { kind: 'cite8', baseUrl: 'https://cite8.dev' },
    };
    const res = lintCitations(md, directPolicy, 'foo.md');
    expect(res.ok).toBe(true);
    expect(res.findings).toHaveLength(0);
  });

  it('honors a non-health forbidden-pattern set without engine changes', () => {
    const devopsPolicy: CitationConfig = {
      policy: 'search-urls-only',
      forbiddenPatterns: ['\\bTODO\\b', '\\bFIXME\\b'],
      referenceFormat: 'n/a',
      verifier: { kind: 'none' },
    };
    const res = lintCitations('all good // TODO add the postmortem link', devopsPolicy);
    expect(res.ok).toBe(false);
    expect(res.findings[0]?.hit).toBe('TODO');
  });
});

// ---------------------------------------------------------------------------
// Verifiers
// ---------------------------------------------------------------------------

describe('NullVerifier', () => {
  it('always returns disabled', async () => {
    const report = await new NullVerifier().verifyClaims(['anything']);
    expect(report.status).toBe('disabled');
  });
});

describe('PrimarySourceVerifier', () => {
  it('supports claims that carry a matching primary source', async () => {
    const v = new PrimarySourceVerifier({ sourcePatterns: ['datatracker\\.ietf\\.org'] });
    const report = await v.verifyClaims([
      'QUIC ships in [RFC 9000](https://datatracker.ietf.org/doc/rfc9000)',
      'A claim with no link at all',
      'A claim with [an off-list link](https://example.com/blog)',
    ]);
    expect(report.status).toBe('verified');
    if (report.status !== 'verified') return;
    const byVerdict = report.claims.map((c) => c.verdict);
    expect(byVerdict[0]).toBe('supports');
    expect(byVerdict[1]).toBe('unverified');
    expect(byVerdict[2]).toBe('unrelated');
    expect(report.verdict).toBe('warn'); // unverified + unrelated present
  });

  it('accepts any http(s) URL when no source patterns are configured', async () => {
    const v = new PrimarySourceVerifier();
    const report = await v.verifyClaims(['cited https://example.org/paper']);
    expect(report.status).toBe('verified');
    if (report.status !== 'verified') return;
    expect(report.claims[0]?.verdict).toBe('supports');
  });
});

describe('Cite8Verifier', () => {
  const fakeHttp = (payload: unknown, ok = true, status = 200): HttpClient => ({
    fetch: async () => ({
      ok,
      status,
      text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
      json: async () => payload,
    }),
  });

  it('returns disabled without an api key', async () => {
    const v = new Cite8Verifier({ http: fakeHttp({}) });
    const report = await v.verifyClaims(['a claim']);
    expect(report.status).toBe('disabled');
  });

  it('aggregates per-claim verifications into a verified report', async () => {
    const v = new Cite8Verifier({
      apiKey: 'test-key',
      http: fakeHttp({
        claim: 'imaging rarely helps',
        verifications: [
          {
            pmid: '17909209',
            title: 'ACP/APS guideline',
            verdict: 'supports',
            pubmed_url: 'https://pubmed.ncbi.nlm.nih.gov/17909209/',
            quote: 'Routine imaging is not associated with benefit',
          },
        ],
        strength: { label: 'strong support' },
      }),
    });
    const report = await v.verifyClaims(['imaging rarely helps']);
    expect(report.status).toBe('verified');
    if (report.status !== 'verified') return;
    expect(report.verdict).toBe('ok');
    expect(report.claims[0]?.verdict).toBe('supports');
    expect(report.claims[0]?.sources[0]?.pmid).toBe('17909209');
    expect(report.claims[0]?.notes).toBe('strong support');
  });

  it('surfaces error when every cite8 lookup fails', async () => {
    const v = new Cite8Verifier({ apiKey: 'test-key', http: fakeHttp('upstream 500', false, 500) });
    const report = await v.verifyClaims(['a claim']);
    expect(report.status).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Factory — config picks the implementation, no engine code changes
// ---------------------------------------------------------------------------

describe('createVerifier', () => {
  it('returns NullVerifier for kind=none', () => {
    expect(createVerifier(defaultCitationConfig).kind).toBe('none');
  });

  it('returns Cite8Verifier for kind=cite8', () => {
    const cfg: CitationConfig = {
      ...defaultCitationConfig,
      verifier: { kind: 'cite8' },
    };
    expect(createVerifier(cfg, { apiKey: 'k' }).kind).toBe('cite8');
  });

  it('returns PrimarySourceVerifier for kind=primary-source', () => {
    const cfg: CitationConfig = {
      ...defaultCitationConfig,
      verifier: { kind: 'primary-source' },
    };
    expect(createVerifier(cfg).kind).toBe('primary-source');
  });
});
