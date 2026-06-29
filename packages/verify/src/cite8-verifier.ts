import { buildReport } from './report.js';
import {
  defaultHttpClient,
  type ClaimResult,
  type ClaimSource,
  type ClaimVerifier,
  type HttpClient,
  type Verdict,
  type VerificationReport,
  type VerifyOptions,
} from './types.js';

/**
 * Health-domain claim verifier backed by cite8 (https://cite8.dev), a RAG
 * service over a curated PubMed subset. Faithful port of the LIVE per-claim
 * path in Body of Health `src/lib/admin/cite8.ts` (`verifyClaim` +
 * `verifyClaims` + `summarizeVerifications`).
 *
 * cite8's live V1 API is PER-CLAIM:
 *   POST {baseUrl}/api/v1/verify-claim  { claim, k?, include_quotes? }
 *     -> { claim, verifications: [{ pmid, doi, title, verdict, quote, ... }],
 *          strength: { direction, strength, label } }
 * There is NO article-level endpoint — the caller extracts discrete claims and
 * we loop each through verify-claim, aggregating into a VerificationReport.
 *
 * NOTE: the dead `/verify-article` batch endpoint (BoH `verifyArticle`, which
 * 404s — cite8 never shipped it) is intentionally NOT ported. See BoH
 * cite8.ts:78-131 for the dead contract.
 */

const CITE8_DEFAULT_BASE = 'https://cite8.dev';

export interface Cite8VerifierOptions {
  /** Bearer token. Without it, verifyClaims returns `{ status: 'disabled' }`. */
  apiKey?: string;
  /** API base URL. Defaults to https://cite8.dev (apex — api.cite8.dev has no DNS). */
  baseUrl?: string;
  /** Injectable HTTP client; defaults to platform `fetch`. */
  http?: HttpClient;
}

/** Shape of one ranked verification cite8 returns per claim. */
interface Cite8Verification {
  cite8_id?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  pubmed_url?: string;
  doi_url?: string;
  verdict?: string; // supports | partial | contradicts | unrelated | unknown
  quote?: string;
}

interface Cite8Strength {
  direction?: string;
  strength?: string;
  label?: string;
}

export class Cite8Verifier implements ClaimVerifier {
  readonly kind = 'cite8';
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly http: HttpClient;

  constructor(opts: Cite8VerifierOptions = {}) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || CITE8_DEFAULT_BASE).replace(/\/$/, '');
    this.http = opts.http ?? defaultHttpClient;
  }

  async verifyClaims(claims: string[], opts?: VerifyOptions): Promise<VerificationReport> {
    if (!this.apiKey) {
      return {
        status: 'disabled',
        reason: 'cite8 API key not configured. Set it to activate verification.',
      };
    }
    const list = claims.map((c) => c.trim()).filter(Boolean);
    if (!list.length) {
      return { status: 'disabled', reason: 'No verifiable research claims found in the draft.' };
    }

    const results: ClaimResult[] = [];
    let errored = 0;
    let lastError = '';

    for (const claim of list) {
      const r = await this.verifyOne(claim, opts);
      if (r.kind === 'error') {
        errored += 1;
        lastError = r.reason;
        results.push({
          claim,
          verdict: 'unverified',
          sources: [],
          notes: `cite8 lookup failed: ${r.reason}`,
        });
        continue;
      }
      const { verdict, sources, notes } = summarizeVerifications(r.verifications, r.strength);
      results.push({ claim, verdict, sources, notes });
    }

    // If EVERY lookup failed, cite8 is down — surface that as `error` (the
    // actionable signal the old 404 gave) rather than a misleading
    // "all claims unverified" report. Ported from BoH verifyClaims:307.
    if (errored === list.length) {
      return { status: 'error', reason: lastError || 'All cite8 lookups failed.' };
    }

    return buildReport(results);
  }

  private async verifyOne(
    claim: string,
    opts?: VerifyOptions,
  ): Promise<
    | { kind: 'ok'; verifications: Cite8Verification[]; strength?: Cite8Strength }
    | { kind: 'error'; reason: string }
  > {
    const k = opts?.k ?? 4;
    const include_quotes = opts?.includeQuotes ?? true;
    try {
      const res = await this.http.fetch(`${this.baseUrl}/api/v1/verify-claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ claim, k, include_quotes }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { kind: 'error', reason: `cite8 ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = (await res.json()) as {
        verifications?: Cite8Verification[];
        strength?: Cite8Strength;
      };
      return {
        kind: 'ok',
        verifications: Array.isArray(data.verifications) ? data.verifications : [],
        strength: data.strength,
      };
    } catch (err) {
      return { kind: 'error', reason: (err as Error).message };
    }
  }
}

/**
 * Collapse one claim's ranked verifications into a single claim-level verdict +
 * the strongest sources to show. supports beats partial beats contradicts beats
 * unverified. Ported verbatim from BoH `summarizeVerifications`.
 */
function summarizeVerifications(
  verifications: Cite8Verification[],
  strength?: Cite8Strength,
): { verdict: Verdict; sources: ClaimSource[]; notes?: string } {
  const norm = (v?: string) => (v || '').toLowerCase();
  const has = (v: string) => verifications.some((x) => norm(x.verdict) === v);
  const verdict: Verdict = has('supports')
    ? 'supports'
    : has('partial')
      ? 'partial'
      : has('contradicts')
        ? 'contradicts'
        : 'unverified';
  const rank: Record<string, number> = {
    supports: 0,
    partial: 1,
    contradicts: 2,
    unrelated: 3,
    unknown: 4,
  };
  const sources: ClaimSource[] = [...verifications]
    .sort((a, b) => (rank[norm(a.verdict)] ?? 9) - (rank[norm(b.verdict)] ?? 9))
    .slice(0, 3)
    .map((v) => ({
      url: v.pubmed_url || v.doi_url || (v.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${v.pmid}/` : ''),
      title: v.title,
      pmid: v.pmid,
      doi: v.doi,
      quote: v.quote,
    }))
    .filter((s) => s.url || s.title);
  const notes =
    strength?.label ||
    (strength?.direction && strength?.strength
      ? `${strength.direction} / ${strength.strength}`
      : undefined);
  return { verdict, sources, notes };
}
