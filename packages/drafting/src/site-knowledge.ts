/**
 * getSiteKnowledge — the prompt-injection knowledge base.
 *
 * Ported from Body of Health `src/lib/admin/site-knowledge.ts`. Two couplings
 * broken:
 *   1. `astro:content` getCollection + the hardcoded SITE_PAGES / podcast list
 *      → `KnowledgeProviders` (injected; each method best-effort).
 *   2. The inline VOICE_RULES constant + GEO SOP table → built from `pack.voice`
 *      + `pack.content.categoryTargets` (the single source per
 *      DECOUPLING-NOTES "Voice block duplicated ×4").
 *
 * The priority-keyword injection (BoH `priority-keywords.ts`) is folded in here
 * via `providers.priorityKeywords()` — the aggregation/caching that read
 * competitor-audits.json moves behind the provider, so the engine stays free of
 * GitHub coupling.
 */

import type {
  DraftingPack,
  KnowledgeProviders,
  PriorityKeywordHint,
} from './types.js';

/** The voice + GEO-SOP rules block. BoH `VOICE_RULES`, every literal lifted. */
export function buildVoiceRules(pack: DraftingPack): string {
  const banned = [
    pack.voice.bannedTopics.length ? `Do not write about: ${pack.voice.bannedTopics.join('; ')}.` : '',
    pack.voice.bannedPhrasings.length
      ? `Do not use: ${pack.voice.bannedPhrasings.map((p) => `"${p}"`).join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const geoFraming = pack.brand.geoFraming ? ` Default geographic framing: "${pack.brand.geoFraming}".` : '';
  const extraRules = pack.voice.rules.length ? '\n' + pack.voice.rules.map((r) => `- ${r}`).join('\n') : '';

  const categoryRows = pack.content.categories
    .map((c) => `| ${c} | **${pack.content.categoryTargets[c] ?? pack.scoring.geo.floor}+** |`)
    .join('\n');

  const anchors = pack.voice.voiceAnchorUrls.length
    ? `\n\nVoice anchors: ${pack.voice.voiceAnchorUrls.join(', ')}.`
    : '';

  return `Brand voice: ${pack.voice.persona} ${banned}${geoFraming}${extraRules}

Article categories: ${pack.content.categories.join(', ')}.

Owner: ${pack.brand.name}.

## GEO SOP — tiered targets per article category, hard floor ${pack.scoring.geo.floor}/100

Every article is scored on six weighted checks measuring "citability" by AI search engines.

**FLOOR — GEO ≥ ${pack.scoring.geo.floor} / 100, all categories.** Below this is missing structural signals and is blocked at PR time by the CI floor gate. Hard floor; do not ship below it.

**TARGET — category-tiered (aspirational ceiling, voice always wins the tiebreaker). These are the ONLY valid values for the frontmatter 'category:' field; schema enforced.**

| Category | Target |
|---|---|
${categoryRows}

**Narrative-style structural ceiling (≈ ${pack.scoring.geo.floor}–${pack.scoring.geo.floor + 5}, regardless of category).** Historical-narrative or third-person long-form mode tops out here because forcing first-person markers warps voice. The ceiling is set by the writing mode, not the category. When writing in that mode, hit ${pack.scoring.geo.floor} cleanly and stop.${anchors}

The six weighted checks (mirrored in @jeldon/core-scoring's calculateGeo and the live dial):
1. **Statistic density** (weight 25) — ≥ 10 concrete numbers / percentages / dates per 1000 words.
2. **Direct quotes with attribution** (weight 25) — ≥ 2 verbatim "…" pull-quotes followed by an attribution.
3. **Citation density** (weight 15) — ≥ 2 source links per 1000 words.
4. **First-person markers** (weight 15) — ≥ 4 "when I see…", "I treat…", "in our practice…" phrases.
5. **Question-style H2 headings** (weight 10) — ≥ 2 H2s that are questions or open with what/when/why/how/can/do/is/should/who.
6. **Authority markers** (weight 10) — ≥ 3 of: "according to…", "et al.", "published in", named guideline, "RCT", "meta-analysis", "systematic review".

When drafting or editing, work the list to hit the category target. If a check is failing AND fixing it would warp voice — pull the claim instead. Removing > flattening. Voice ALWAYS wins the tiebreaker.`;
}

function priorityBlock(keywords: PriorityKeywordHint[]): string {
  if (!keywords.length) return '';
  return `## Competitor priority keywords (gaps we want to close)

These are keywords surfaced from rival sites that we don't currently cover well. Weight is the summed prominence across competitors (higher = they emphasize it more). When the article topic naturally relates to one, WEAVE IT IN — use the phrasing in a heading, subheading, or natural body sentence. Never force a keyword in if it doesn't fit; voice and clarity trump SEO. But when there's a fit, lean in.

${keywords
  .map(
    (k) =>
      `- "${k.phrase}" (weight ${k.totalWeight}, ${k.intents.join('/')}; used by: ${k.competitors.join(', ')})`,
  )
  .join('\n')}
`;
}

/**
 * Build the full knowledge-base prompt block. Mirrors BoH `getSiteKnowledge`,
 * but every data source is a `KnowledgeProviders` method (each best-effort) and
 * the rules come from `pack`. Pass the pack first (config), providers second
 * (data) — the reverse of BoH's argument order, which baked the data source in.
 */
export async function getSiteKnowledge(
  pack: DraftingPack,
  providers: KnowledgeProviders,
  opts: { priorityKeywordLimit?: number } = {},
): Promise<string> {
  const safe = async <T>(fn: (() => Promise<T>) | undefined, fallback: T): Promise<T> => {
    if (!fn) return fallback;
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const articles = await safe(() => providers.listArticles(), []);
  const pages = await safe(
    providers.listSitePages ? () => providers.listSitePages!() : undefined,
    [],
  );
  const crossPromo = await safe(
    providers.listCrossPromo ? () => providers.listCrossPromo!() : undefined,
    [],
  );
  const keywords = await safe(
    providers.priorityKeywords
      ? () => providers.priorityKeywords!(opts.priorityKeywordLimit ?? 30)
      : undefined,
    [],
  );
  const voiceMemoryBlock = await safe(
    providers.voiceMemoryBlock ? () => providers.voiceMemoryBlock!() : undefined,
    '',
  );

  const articleLines = [...articles]
    .sort((a, b) => (b.publishDate ?? '').localeCompare(a.publishDate ?? ''))
    .map((a) => {
      const status = a.draft ? '[DRAFT]' : '[LIVE]';
      const series = a.series ? ` [series: ${a.series}]` : '';
      const tags = a.tags.length ? ` — tags: ${a.tags.join(', ')}` : '';
      return `- ${status} /articles/${a.slug} (${a.category})${series} "${a.title}"${tags}\n  ${a.excerpt}`;
    })
    .join('\n');

  const pageLines = pages.map((p) => `- ${p.url} — ${p.title}: ${p.summary}`).join('\n');
  const crossPromoLines = crossPromo
    .map((e) => `- ${e.topic} (${e.url}) — match: ${e.match.join(', ')}\n  Note: ${e.note}`)
    .join('\n');

  const pBlock = priorityBlock(keywords);

  return `# ${pack.brand.name} — site knowledge base

${buildVoiceRules(pack)}
${voiceMemoryBlock ? `\n${voiceMemoryBlock}` : ''}${pageLines ? `## Site pages\n${pageLines}\n\n` : ''}## Existing articles
${articleLines || '(none yet)'}
${crossPromoLines ? `\n## Curated cross-promo sources\n${crossPromoLines}\n` : ''}${pBlock ? `\n${pBlock}` : ''}
When discussing content gaps, cross-links, or new article angles, ground your answers in this inventory. When you suggest a cross-link, name the actual URL from above. When you spot a gap, name what specifically is missing relative to what already exists.`;
}
