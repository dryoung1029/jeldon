import type { CitationConfig } from '@jeldon/config';

/**
 * Citation linter. Faithful port of Body of Health `scripts/lint-citations.mjs`,
 * with the two hardcoded health regexes (PMID, DOI) lifted into
 * `pack.citation.forbiddenPatterns` so the engine is domain-agnostic.
 *
 * THE POLICY ENUM RESOLVES THE LINT-VS-CITE8 CONTRADICTION
 * (DECOUPLING-NOTES: "Citation-policy contradiction"):
 *   - 'search-urls-only'   — fabricated-citation guard ON. Authors must use
 *                            search URLs; bare PMIDs/DOIs are forbidden. This is
 *                            the original BoH lint behavior.
 *   - 'direct-source-urls' — a verifier (e.g. cite8) supplies VERIFIED PMIDs/DOIs,
 *                            so flagging them would fight the verifier. Lint is a
 *                            no-op for the forbidden patterns under this policy.
 *   - 'verifier-required'  — same as direct-source-urls for linting purposes; the
 *                            verifier is the gate, not the linter.
 *
 * The mechanics (scan each file's text for every forbidden pattern, report
 * file:line:hit) are lifted verbatim; only the pattern source and the
 * policy gate are config-driven now.
 */

export interface LintFinding {
  /** Optional source label (e.g. a file path) when linting a named document. */
  file?: string;
  line: number;
  /** Which forbidden pattern matched (its index + the raw source). */
  patternIndex: number;
  pattern: string;
  hit: string;
}

export interface LintResult {
  ok: boolean;
  findings: LintFinding[];
}

/**
 * Lint a single markdown document against the citation policy.
 *
 * @param md     the markdown body to scan
 * @param policy the Domain Pack's `citation` config
 * @param file   optional label attached to each finding (a path, slug, etc.)
 */
export function lintCitations(md: string, policy: CitationConfig, file?: string): LintResult {
  // Under direct-source / verifier-required policies, verified PMIDs/DOIs are
  // the intended format — the forbidden-pattern guard would be self-defeating.
  if (policy.policy !== 'search-urls-only') {
    return { ok: true, findings: [] };
  }

  const findings: LintFinding[] = [];
  policy.forbiddenPatterns.forEach((source, patternIndex) => {
    const re = compile(source);
    if (!re) return;
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(md)) !== null) {
      const line = md.slice(0, match.index).split('\n').length;
      findings.push({ file, line, patternIndex, pattern: source, hit: match[0] });
      // Guard against zero-width matches looping forever.
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
  });

  return { ok: findings.length === 0, findings };
}

/**
 * Lint many documents at once. Mirrors the CLI shape of `lint-citations.mjs`
 * (a list of files → a single pass/fail with per-file findings). Reading the
 * files is the caller's job — this package does no fs I/O (DECOUPLING-NOTES:
 * I/O behind an interface; here the document text is just passed in).
 */
export function lintDocuments(
  docs: Array<{ file?: string; md: string }>,
  policy: CitationConfig,
): LintResult {
  const findings: LintFinding[] = [];
  for (const doc of docs) {
    findings.push(...lintCitations(doc.md, policy, doc.file).findings);
  }
  return { ok: findings.length === 0, findings };
}

/** Render findings as a human-readable report (the `console.error` block in the
 *  original script), returned as a string so the host owns the I/O. */
export function formatLintReport(result: LintResult, policy: CitationConfig): string {
  if (result.ok) {
    return 'Citation linter: no forbidden citation patterns found.';
  }
  const lines = result.findings.map((f) => {
    const loc = f.file ? `${f.file}:${f.line}` : `line ${f.line}`;
    return `  ${loc}  [pattern ${f.patternIndex}]  "${f.hit}"`;
  });
  return [
    `Citation linter: ${result.findings.length} forbidden citation pattern(s) found.`,
    '',
    ...lines,
    '',
    `Citation policy: "${policy.policy}". Reference format: ${policy.referenceFormat}`,
    'A human reviewer can override by merging anyway — the failure is the',
    'discussion trigger, not the verdict.',
  ].join('\n');
}

function compile(source: string): RegExp | null {
  try {
    // Global so we can sweep every occurrence; case-insensitive matches the
    // original PMID scan. DOI patterns are case-sensitive in practice but the
    // `i` flag is harmless for them.
    return new RegExp(source, 'gi');
  } catch {
    return null;
  }
}
