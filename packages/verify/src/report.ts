import type { ClaimResult, VerdictCounts, VerificationReport } from './types.js';

/**
 * Roll a list of per-claim results into a `verified` report. The severity
 * ordering is lifted verbatim from BoH `verifyClaims`:
 *   bad  = at least one `contradicts`
 *   warn = at least one `unverified` or `unrelated`
 *   ok   = everything else (all supports/partial)
 */
export function buildReport(results: ClaimResult[]): VerificationReport {
  const counts: VerdictCounts = {
    supports: 0,
    partial: 0,
    contradicts: 0,
    unrelated: 0,
    unverified: 0,
  };
  for (const c of results) counts[c.verdict] += 1;
  const verdict: 'ok' | 'warn' | 'bad' =
    counts.contradicts > 0
      ? 'bad'
      : counts.unrelated + counts.unverified > 0
        ? 'warn'
        : 'ok';
  return {
    status: 'verified',
    verifiedAt: new Date().toISOString(),
    claims: results,
    counts,
    verdict,
  };
}

/**
 * Tiny human-readable summary appended to an assistant reply so the editor sees
 * the verification state inline. Ported from BoH `formatReport`, generalized
 * (no "cite8" literal — takes the verifier name).
 */
export function formatReport(report: VerificationReport, verifierName = 'verifier'): string {
  if (report.status === 'disabled') return '';
  if (report.status === 'error') {
    return `\n\n---\n**${verifierName} verification: error** — ${report.reason}\n_(Drafted anyway. Re-verify after editing.)_`;
  }
  const { counts, verdict, claims } = report;
  const total = claims.length;
  const head =
    verdict === 'ok'
      ? `✅ **${verifierName}: all ${total} claims supported**`
      : verdict === 'warn'
        ? `⚠️ **${verifierName}: ${counts.unverified + counts.unrelated} of ${total} claims need review**`
        : `❌ **${verifierName}: ${counts.contradicts} of ${total} claims contradicted — fix before publishing**`;
  const flagged = claims.filter((c) => c.verdict !== 'supports').slice(0, 5);
  const detail = flagged.length
    ? '\n' +
      flagged
        .map(
          (c) =>
            `- _${c.verdict}_: "${c.claim.slice(0, 140)}${c.claim.length > 140 ? '…' : ''}"${c.notes ? ` — ${c.notes}` : ''}`,
        )
        .join('\n')
    : '';
  return `\n\n---\n${head}${detail}`;
}
