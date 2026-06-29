// @jeldon/verify — pluggable citation verification + citation linting.
//
// Extracts Body of Health `src/lib/admin/cite8.ts` (verifier) and
// `scripts/lint-citations.mjs` (linter). Every health/PubMed literal is lifted
// into the Domain Pack's `citation` config; the lint-vs-cite8 contradiction is
// resolved by the `citation.policy` enum.

export type {
  ClaimVerifier,
  ClaimResult,
  ClaimSource,
  Verdict,
  VerdictCounts,
  VerificationReport,
  VerifyOptions,
  HttpClient,
  HttpResponse,
} from './types.js';
export { defaultHttpClient } from './types.js';

export { NullVerifier } from './null-verifier.js';
export { Cite8Verifier, type Cite8VerifierOptions } from './cite8-verifier.js';
export {
  PrimarySourceVerifier,
  type PrimarySourceVerifierOptions,
} from './primary-source-verifier.js';

export { createVerifier, type VerifierFactoryOptions } from './factory.js';

export { buildReport, formatReport } from './report.js';

export {
  lintCitations,
  lintDocuments,
  formatLintReport,
  type LintFinding,
  type LintResult,
} from './lint.js';

export { defaultCitationConfig } from './defaults.js';
