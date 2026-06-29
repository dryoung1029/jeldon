import type { CitationConfig } from '@jeldon/config';
import { Cite8Verifier } from './cite8-verifier.js';
import { NullVerifier } from './null-verifier.js';
import { PrimarySourceVerifier } from './primary-source-verifier.js';
import type { ClaimVerifier, HttpClient } from './types.js';

export interface VerifierFactoryOptions {
  /** Bearer token for network verifiers (e.g. cite8). Read from env by the host. */
  apiKey?: string;
  /** Source-pattern allow-list for PrimarySourceVerifier. Defaults to the GEO
   *  citation patterns when omitted by the caller. */
  sourcePatterns?: string[];
  /** Injectable HTTP client (tests / non-network hosts). */
  http?: HttpClient;
}

/**
 * Resolve the configured `ClaimVerifier` from a Domain Pack's citation config.
 * `none` → NullVerifier (default, never blocks); `cite8` → health plugin;
 * `primary-source` → generic resolvable-link verifier.
 *
 * Mirrors how BoH chose its path by env presence, but the choice is now an
 * explicit config field (`citation.verifier.kind`) instead of "is CITE8_API_KEY
 * set". A missing apiKey on a `cite8` pack still degrades to disabled at call
 * time — the verifier returns `{ status: 'disabled' }`, exactly as BoH did.
 */
export function createVerifier(
  citation: CitationConfig,
  opts: VerifierFactoryOptions = {},
): ClaimVerifier {
  switch (citation.verifier.kind) {
    case 'cite8':
      return new Cite8Verifier({
        apiKey: opts.apiKey,
        baseUrl: citation.verifier.baseUrl,
        http: opts.http,
      });
    case 'primary-source':
      return new PrimarySourceVerifier({ sourcePatterns: opts.sourcePatterns });
    case 'none':
    default:
      return new NullVerifier();
  }
}
