/**
 * The score → verify → collect-issues stage of the draft pipeline.
 *
 * Ported from BoH `author.ts`: `extractResearchClaims`, `scoreAndVerify`,
 * `collectIssues`. Two couplings broken:
 *   1. `calculateSeo`/`calculateGeo` from `seo.ts` → `@jeldon/core-scoring`
 *      (run with `pack.scoring`, so a different pack scores differently).
 *   2. cite8 hardwired → a `ClaimVerifier` from `@jeldon/verify` (NullVerifier
 *      default; Cite8Verifier for health). The claim EXTRACTION (an LLM job —
 *      kept out of @jeldon/verify) stays here via the injected `LlmProvider`.
 */

import { calculateGeo, calculateSeo } from '@jeldon/core-scoring';
import type { ClaimVerifier, VerificationReport } from '@jeldon/verify';
import { formatReport } from '@jeldon/verify';
import { resolveModel } from './provider.js';
import { EXTRACT_CLAIMS_TOOL } from './tools.js';
import type {
  DraftFrontmatterCodec,
  DraftingPack,
  DraftResult,
  LlmProvider,
  ScorePair,
} from './types.js';

export { formatReport };

/**
 * Pull the discrete, verifiable RESEARCH claims out of a draft via a cheap
 * utility-model call. Returns [] on any failure — verification then no-ops
 * rather than blocking the draft. BoH `author.ts::extractResearchClaims`.
 */
export async function extractResearchClaims(
  provider: LlmProvider,
  pack: DraftingPack,
  system: string,
  markdown: string,
): Promise<string[]> {
  const models = pack.drafting?.models ?? {};
  const utility = pack.drafting?.utilityModel ?? 'haiku';
  const model = resolveModel(models, utility, utility);
  const maxTokens = pack.drafting?.maxTokens.extractClaims ?? 1500;
  try {
    const res = await provider.complete({
      model,
      maxTokens,
      system,
      tools: [EXTRACT_CLAIMS_TOOL],
      toolChoice: { type: 'tool', name: 'extract_claims' },
      messages: [{ role: 'user', content: markdown }],
    });
    for (const block of res.blocks) {
      if (block.type === 'tool_use' && block.name === 'extract_claims') {
        const claims = (block.input as { claims?: unknown }).claims;
        if (Array.isArray(claims)) {
          return claims.map((c) => String(c).trim()).filter(Boolean).slice(0, 8);
        }
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Score a draft (SEO + GEO via @jeldon/core-scoring) from its frontmatter +
 * body. Pure — no verification, no LLM. Exposed so the draft loop can cheaply
 * re-score after a post-processing step (e.g. hero enrichment) without re-running
 * claim verification.
 */
export function scoreContent(
  pack: DraftingPack,
  codec: DraftFrontmatterCodec,
  draft: Pick<DraftResult, 'slug' | 'content'>,
): ScorePair {
  const fm = codec.parse(draft.content);
  const input = {
    title: fm.title,
    excerpt: fm.excerpt,
    tags: fm.tags,
    body: fm.body,
    slug: draft.slug,
    heroImage: fm.heroImage,
    heroImageAlt: fm.heroImageAlt,
  };
  return {
    seo: calculateSeo(input, pack.scoring.seo).score,
    geo: calculateGeo(input, pack.scoring.geo).score,
  };
}

/** Score a draft (SEO + GEO via @jeldon/core-scoring) and verify its research
 *  claims via the injected verifier. BoH `author.ts::scoreAndVerify`. */
export async function scoreAndVerify(args: {
  provider: LlmProvider;
  pack: DraftingPack;
  verifier: ClaimVerifier;
  codec: DraftFrontmatterCodec;
  extractSystem: string;
  draft: Pick<DraftResult, 'slug' | 'content'>;
}): Promise<{ scores: ScorePair; report: VerificationReport }> {
  const { provider, pack, verifier, codec, extractSystem, draft } = args;
  const fm = codec.parse(draft.content);
  const scores = scoreContent(pack, codec, draft);

  // Skip extraction entirely when the verifier is the null/disabled path.
  let report: VerificationReport;
  if (verifier.kind === 'none') {
    report = { status: 'disabled', reason: 'No verifier configured.' };
  } else {
    const claims = await extractResearchClaims(provider, pack, extractSystem, fm.body || draft.content);
    report = await verifier.verifyClaims(claims, { k: 4, includeQuotes: true });
  }
  return { scores, report };
}

/**
 * Build the human-readable issue list driving the fix-pass decision. Empty
 * means the draft passed. BoH `author.ts::collectIssues`, with the floor read
 * from `pack.drafting.draftFloor`.
 */
export function collectIssues(
  pack: DraftingPack,
  scores: ScorePair,
  report: VerificationReport,
): string[] {
  const floorSeo = pack.drafting?.draftFloor.seo ?? pack.scoring.geo.floor;
  const floorGeo = pack.drafting?.draftFloor.geo ?? pack.scoring.geo.floor;
  const issues: string[] = [];

  if (scores.seo < floorSeo) {
    issues.push(
      `SEO score is ${scores.seo}/100 — below the ${floorSeo} floor. Likely fixes: tighten title length, excerpt length, ensure internal links, hit 3–6 H2 sections, land the word count in range.`,
    );
  }
  if (scores.geo < floorGeo) {
    issues.push(
      `GEO score is ${scores.geo}/100 — below the ${floorGeo} floor. Apply the GEO playbook: ≥ 5 concrete numbers per 1000 words (target 10+), ≥ 1 attributed pull-quote (target 2+), ≥ 1 source URL per 1000 words (target 2+), ≥ 2 first-person markers, ≥ 1 question-style H2, ≥ 1 authority marker.`,
    );
  }
  if (report.status === 'verified') {
    const flagged = report.claims.filter(
      (c) => c.verdict === 'contradicts' || c.verdict === 'unverified',
    );
    if (flagged.length) {
      const list = flagged
        .slice(0, 8)
        .map((c) => `  - [${c.verdict}] "${c.claim.slice(0, 200)}"${c.notes ? ` — ${c.notes}` : ''}`)
        .join('\n');
      issues.push(
        `The verifier flagged ${flagged.length} claim(s) as contradicted or unverified. Either fix the wording to match what the sources support, OR remove the claim — do NOT fabricate a new citation. Flagged claims:\n${list}`,
      );
    }
  }
  return issues;
}
