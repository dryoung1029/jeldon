import type { ClaimVerifier, VerificationReport } from './types.js';

/**
 * The default verifier: verifies nothing, never blocks. Returns the same
 * `{ status: 'disabled' }` signal BoH's cite8 client returned when
 * `CITE8_API_KEY` was unset, so the drafting flow proceeds unchanged. A domain
 * with no verification service gets this and the linter does all the work.
 *
 * Ported from the `if (!apiKey) return { status: 'disabled' }` branches in
 * Body of Health `src/lib/admin/cite8.ts`.
 */
export class NullVerifier implements ClaimVerifier {
  readonly kind = 'none';

  async verifyClaims(): Promise<VerificationReport> {
    return {
      status: 'disabled',
      reason: 'No claim verifier configured (citation.verifier.kind = "none").',
    };
  }
}
