/**
 * Citation-verification contracts. Domain-agnostic: the BoH `Cite8Report`,
 * `Cite8ClaimResult`, `Cite8Source` shapes are lifted here as `VerificationReport`,
 * `ClaimResult`, `ClaimSource` — verbatim in structure, generic in name — so a
 * health domain (cite8/PubMed) and a non-health domain (RFCs, CVEs, primary
 * sources) flow through the same interface.
 *
 * Ported from Body of Health `src/lib/admin/cite8.ts` (the `Cite8*` type block).
 */

/** Per-claim verdict. `unverified` covers unrelated/unknown/nothing-returned. */
export type Verdict = 'supports' | 'partial' | 'contradicts' | 'unrelated' | 'unverified';

/** A single resolved source backing (or contradicting) a claim. */
export interface ClaimSource {
  url: string;
  title?: string;
  /** Health-domain identifiers — optional, never required by the engine. */
  pmid?: string;
  doi?: string;
  quote?: string;
}

export interface ClaimResult {
  claim: string;
  verdict: Verdict;
  confidence?: number;
  sources: ClaimSource[];
  notes?: string;
}

export interface VerdictCounts {
  supports: number;
  partial: number;
  contradicts: number;
  unrelated: number;
  unverified: number;
}

/**
 * The aggregate report `verifyClaims` returns. Three terminal shapes, lifted
 * verbatim from BoH `Cite8Report`:
 *   - `disabled` — no verifier configured / no claims (the NullVerifier path)
 *   - `error`    — the verifier was reachable-and-tried but every lookup failed
 *   - `verified` — at least one claim resolved; `verdict` rolls up severity
 */
export type VerificationReport =
  | { status: 'disabled'; reason: string }
  | { status: 'error'; reason: string }
  | {
      status: 'verified';
      verifiedAt: string;
      claims: ClaimResult[];
      counts: VerdictCounts;
      /** ok = all supports/partial · warn = some unverified/unrelated · bad = some contradicts. */
      verdict: 'ok' | 'warn' | 'bad';
    };

export interface VerifyOptions {
  /** How many candidate sources to request per claim. */
  k?: number;
  includeQuotes?: boolean;
}

/**
 * The portable contract every verifier implements. The drafting/editor flows
 * extract discrete claims (an LLM job — kept OUT of this package so it stays
 * free of provider coupling) and hand the list here.
 */
export interface ClaimVerifier {
  /** Stable id for logging/UX (`none` | `cite8` | `primary-source`). */
  readonly kind: string;
  verifyClaims(claims: string[], opts?: VerifyOptions): Promise<VerificationReport>;
}

// ---------------------------------------------------------------------------
// I/O decoupling — HTTP behind an interface (DECOUPLING-NOTES: cite8/PubMed
// hardwired → interface ClaimVerifier). The default uses global `fetch`; tests
// and non-network hosts inject their own.
// ---------------------------------------------------------------------------

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface HttpClient {
  fetch(url: string, init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<HttpResponse>;
}

/** Default HttpClient over the platform `fetch` (Workers, Node 18+, browser). */
export const defaultHttpClient: HttpClient = {
  fetch: (url, init) => fetch(url, init) as unknown as Promise<HttpResponse>,
};
