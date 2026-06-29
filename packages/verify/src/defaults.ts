import type { CitationConfig } from '@jeldon/config';

/**
 * A sensible default citation policy for projects that don't override it. Lives
 * here (not in @jeldon/config's defaults.ts, which has no citation default) to
 * keep this package self-sufficient — `createVerifier(defaultCitationConfig)`
 * and `lintCitations(md, defaultCitationConfig)` both work out of the box.
 *
 * Defaults to the SAFE, no-service posture:
 *   - policy 'search-urls-only' — the fabricated-citation guard is ON
 *   - forbiddenPatterns — the two BoH regexes (PMID, DOI), lifted verbatim from
 *     `scripts/lint-citations.mjs`
 *   - verifier 'none' — NullVerifier; a domain wires cite8/primary-source in
 *     its own pack.
 */
export const defaultCitationConfig: CitationConfig = {
  policy: 'search-urls-only',
  forbiddenPatterns: [
    // PMID_RE from lint-citations.mjs
    '\\bPMID:?\\s*\\d{4,9}\\b',
    // DOI_RE from lint-citations.mjs
    '\\b10\\.\\d{4,9}\\/[^\\s,)\\]<>"\']+',
  ],
  referenceFormat:
    'Author lastname, year. Brief description. [Source](https://example.org/search?q=author+topic)',
  verifier: { kind: 'none' },
};
