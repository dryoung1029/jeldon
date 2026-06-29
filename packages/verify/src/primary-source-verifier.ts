import { buildReport } from './report.js';
import type {
  ClaimResult,
  ClaimSource,
  ClaimVerifier,
  VerificationReport,
  VerifyOptions,
} from './types.js';

/**
 * Generic, network-free verifier for non-health domains: a claim is `supports`
 * if it carries (or resolves to) a linked primary source whose URL matches one
 * of the configured `sourcePatterns`; otherwise it's `unverified`. No external
 * API — this is the "every claim must cite a resolvable source" discipline made
 * mechanical, suitable when there's no domain-specific RAG service like cite8.
 *
 * This is the generic counterpart to Cite8Verifier (DECOUPLING-NOTES row:
 * "PrimarySourceVerifier generic"). It has no BoH source line — BoH only ever
 * had the health/cite8 path — so it's a faithful new implementation of the
 * resolvable-link contract, not a stub.
 *
 * A claim string may embed its source inline:
 *   - a markdown link:  "QUIC ships in [RFC 9000](https://datatracker.ietf.org/doc/rfc9000)"
 *   - a bare URL:       "QUIC ships in RFC 9000 https://datatracker.ietf.org/doc/rfc9000"
 */
export interface PrimarySourceVerifierOptions {
  /**
   * Regex sources (compiled with the `i` flag) that an extracted URL must match
   * to count as a primary source. Empty => any http(s) URL counts.
   * e.g. ['datatracker\\.ietf\\.org', 'nvd\\.nist\\.gov'].
   */
  sourcePatterns?: string[];
}

const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL_RE = /https?:\/\/[^\s<>")\]]+/g;

export class PrimarySourceVerifier implements ClaimVerifier {
  readonly kind = 'primary-source';
  private readonly matchers: RegExp[];

  constructor(opts: PrimarySourceVerifierOptions = {}) {
    this.matchers = (opts.sourcePatterns ?? []).map((p) => new RegExp(p, 'i'));
  }

  async verifyClaims(claims: string[], _opts?: VerifyOptions): Promise<VerificationReport> {
    const list = claims.map((c) => c.trim()).filter(Boolean);
    if (!list.length) {
      return { status: 'disabled', reason: 'No claims supplied to verify.' };
    }

    const results: ClaimResult[] = list.map((claim) => {
      const urls = this.extractSources(claim);
      const matching = urls.filter((s) => this.isPrimarySource(s.url));
      if (matching.length > 0) {
        return {
          claim,
          verdict: 'supports',
          sources: matching,
          notes: `${matching.length} resolvable primary source(s)`,
        };
      }
      if (urls.length > 0) {
        // Has a link, but none match the allowed source patterns.
        return {
          claim,
          verdict: 'unrelated',
          sources: urls,
          notes: 'linked source does not match an allowed primary-source pattern',
        };
      }
      return {
        claim,
        verdict: 'unverified',
        sources: [],
        notes: 'no linked primary source',
      };
    });

    return buildReport(results);
  }

  private isPrimarySource(url: string): boolean {
    if (this.matchers.length === 0) return true;
    return this.matchers.some((re) => re.test(url));
  }

  private extractSources(claim: string): ClaimSource[] {
    const sources: ClaimSource[] = [];
    const seen = new Set<string>();

    MD_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MD_LINK_RE.exec(claim)) !== null) {
      const url = m[2];
      const title = m[1];
      if (url && !seen.has(url)) {
        seen.add(url);
        sources.push({ url, title });
      }
    }

    // Strip out markdown-link URLs already captured, then sweep bare URLs.
    const withoutMdLinks = claim.replace(MD_LINK_RE, ' ');
    BARE_URL_RE.lastIndex = 0;
    while ((m = BARE_URL_RE.exec(withoutMdLinks)) !== null) {
      const url = m[0].replace(/[.,;:)]+$/, '');
      if (url && !seen.has(url)) {
        seen.add(url);
        sources.push({ url });
      }
    }

    return sources;
  }
}
