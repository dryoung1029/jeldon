/**
 * Research digest sources — "what new, verifiable research landed this week".
 *
 * The contract lives here, next to `ClaimVerifier`, because the one shipped
 * adapter (cite8) is the same service the verifier already talks to: same
 * base URL, same bearer key, same injectable `HttpClient`. `@jeldon/drafting`
 * already depends on this package, so its autonomous runner consumes the
 * interface without a new dependency edge, and a host with a different
 * corpus implements `ResearchDigestSource` without touching drafting.
 *
 * Ported from Body of Health `scripts/fetch-cite8-digest.mjs::fetchDigest`.
 */

import { defaultHttpClient, type HttpClient } from './types.js';

/** One newly ingested document, normalised across digest adapters. */
export interface DigestDocument {
  /** Stable id within the source (cite8: the PMID). */
  id: string;
  title: string;
  journal?: string;
  year?: number | string;
  /** Labelled identifiers the prompt can cite verbatim, e.g. `{ PMID: '123' }`.
   *  Sourced from the adapter, never recalled by a model. */
  identifiers: Record<string, string>;
  /** Canonical link to the document, when the source gave one. */
  url?: string;
  /** Free-text corpus / domain tags the relevance filter reads. */
  corpus?: string;
  domains?: string[];
  /** Evidence tier, 1 = strongest. `null` = unclassified. Sort signal only. */
  evidenceLevel?: number | null;
  createdAt?: string;
}

export type DigestFetchResult =
  | { status: 'ok'; documents: DigestDocument[]; total: number; truncated: boolean }
  /** No key / no adapter: nothing was asked. Not the same as "no new papers". */
  | { status: 'not_configured'; reason: string }
  | { status: 'error'; reason: string };

export interface ResearchDigestSource {
  readonly kind: string;
  fetchDigest(opts: { days: number }): Promise<DigestFetchResult>;
}

/** The no-op source. Always `not_configured`, so a run reads as skipped, not empty. */
export class NullDigestSource implements ResearchDigestSource {
  readonly kind = 'none';
  async fetchDigest(): Promise<DigestFetchResult> {
    return { status: 'not_configured', reason: 'No research digest source configured.' };
  }
}

export interface Cite8DigestSourceOptions {
  /** Bearer token. Without it, fetchDigest returns `not_configured`. */
  apiKey?: string;
  /** API base URL. Defaults to the same base `Cite8Verifier` uses. */
  baseUrl?: string;
  http?: HttpClient;
}

interface Cite8DigestDoc {
  pmid?: string | number;
  title?: string;
  journal?: string;
  year?: number | string;
  corpus?: string;
  domains?: string[];
  evidence_level?: number | null;
  created_at?: string;
  pubmed_url?: string;
}

const CITE8_DEFAULT_BASE = 'https://cite8.dev';

/**
 * cite8 `GET /api/v1/digest?days=N` — the uncapped raw feed of documents
 * ingested in the window. `evidence_level` is CEBM (1 strongest .. 5 weakest)
 * and is a sort signal only; cite8's guidance is never to filter on it.
 */
export class Cite8DigestSource implements ResearchDigestSource {
  readonly kind = 'cite8';
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly http: HttpClient;

  constructor(opts: Cite8DigestSourceOptions = {}) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || CITE8_DEFAULT_BASE).replace(/\/$/, '');
    this.http = opts.http ?? defaultHttpClient;
  }

  async fetchDigest({ days }: { days: number }): Promise<DigestFetchResult> {
    if (!this.apiKey) {
      return { status: 'not_configured', reason: 'cite8 digest key not configured.' };
    }
    try {
      const res = await this.http.fetch(`${this.baseUrl}/api/v1/digest?days=${encodeURIComponent(String(days))}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        return { status: 'error', reason: `cite8 digest ${res.status}: ${(await res.text()).slice(0, 300)}` };
      }
      const data = (await res.json()) as { total?: number; truncated?: boolean; documents?: unknown };
      if (!Array.isArray(data?.documents)) {
        return { status: 'error', reason: 'cite8 digest returned no documents array.' };
      }
      const documents = (data.documents as Cite8DigestDoc[])
        .filter((d) => d && typeof d.title === 'string' && d.title.trim())
        .map((d): DigestDocument => {
          const pmid = d.pmid != null ? String(d.pmid) : '';
          return {
            id: pmid || String(d.title),
            title: String(d.title),
            journal: d.journal,
            year: d.year,
            identifiers: pmid ? { PMID: pmid } : {},
            url: d.pubmed_url || undefined,
            corpus: d.corpus,
            domains: Array.isArray(d.domains) ? d.domains : undefined,
            evidenceLevel: typeof d.evidence_level === 'number' ? d.evidence_level : null,
            createdAt: d.created_at,
          };
        });
      return {
        status: 'ok',
        documents,
        total: typeof data.total === 'number' ? data.total : documents.length,
        truncated: data.truncated === true,
      };
    } catch (err) {
      return { status: 'error', reason: `cite8 digest: ${(err as Error).message}` };
    }
  }
}
