/**
 * Hero-image concept + alt-text generation — the drafting-side wiring for
 * @jeldon/media's `proposeHeroConcept`.
 *
 * media ships `proposeHeroConcept(input, proposer, cfg)` but leaves the
 * `ConceptProposer` (one tool-forced LLM round-trip) to be injected, because the
 * Anthropic client lives here in @jeldon/drafting, not in the media package.
 * `LlmConceptProposer` is that adapter over the package's `LlmProvider` — it
 * closes the media `proposeHeroConcept` TODO(port).
 *
 * Phase 1 (this module today): produce the concept + alt-text and write the
 * alt-text into frontmatter. Generating the actual image bytes and writing the
 * `heroImage:` path is the follow-up (`generateHeroForDraft`).
 */

import {
  generateHeroImage,
  proposeHeroConcept,
  type ConceptProposer,
  type HeroConceptInput,
  type HeroConceptProposal,
  type HeroImageResult,
  type ImageGen,
  type ObjectStore,
  type proposeImageTool,
} from '@jeldon/media';
import type { HeroImageConfig } from '@jeldon/config';
import { fmScalar, splitFrontmatter, upsertScalar } from './fm-lite.js';
import { resolveModel } from './provider.js';
import type { LlmProvider, ToolDef } from './types.js';

/** The propose_image tool fields the model returns. */
interface ProposeImageFields {
  topic: string;
  concept: string;
  altText: string;
  filename: string;
  rationale: string;
}

export interface LlmConceptProposerOptions {
  provider: LlmProvider;
  /** Model alias (resolved via `models`) or a raw id. Default: `'sonnet'`. */
  model?: string;
  /** The pack's alias→id map (`pack.drafting.models`). Default: {}. */
  models?: Record<string, string>;
  /** Output cap for the concept call — it's a small tool call. Default: 1024. */
  maxTokens?: number;
}

/**
 * A `ConceptProposer` backed by the drafting `LlmProvider`. Forces the
 * `propose_image` tool and returns its fields. This is the one Anthropic
 * round-trip media deliberately left to the drafting layer.
 */
export class LlmConceptProposer implements ConceptProposer {
  private readonly provider: LlmProvider;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: LlmConceptProposerOptions) {
    this.provider = opts.provider;
    this.model = resolveModel(opts.models ?? {}, opts.model ?? 'sonnet', opts.model);
    this.maxTokens = opts.maxTokens ?? 1024;
  }

  async propose(req: {
    system: string;
    tool: typeof proposeImageTool;
    userMessage: string;
  }): Promise<ProposeImageFields> {
    const res = await this.provider.complete({
      model: this.model,
      maxTokens: this.maxTokens,
      system: req.system,
      tools: [req.tool as unknown as ToolDef],
      toolChoice: { type: 'tool', name: req.tool.name },
      messages: [{ role: 'user', content: req.userMessage }],
    });
    for (const block of res.blocks) {
      if (block.type === 'tool_use' && block.name === req.tool.name) {
        const i = block.input as Record<string, unknown>;
        return {
          topic: String(i.topic ?? ''),
          concept: String(i.concept ?? ''),
          altText: String(i.altText ?? ''),
          filename: String(i.filename ?? ''),
          rationale: String(i.rationale ?? ''),
        };
      }
    }
    throw new Error('Concept proposer: model did not return a propose_image tool call.');
  }
}

/** Build a `HeroConceptInput` from a draft's markdown. */
export function heroInputFromMarkdown(content: string, slug: string): HeroConceptInput {
  const { fm, body } = splitFrontmatter(content);
  return {
    slug,
    title: fmScalar(fm, 'title'),
    category: fmScalar(fm, 'category') || undefined,
    excerpt: fmScalar(fm, 'excerpt') || undefined,
    body,
  };
}

export interface ProposeHeroDeps {
  proposer: ConceptProposer;
  /** Hero style config. Default: media's `defaultMediaConfig.heroImage`. */
  heroImage?: HeroImageConfig;
}

/**
 * Propose a hero concept (topic + visual concept + alt-text + filename +
 * assembled prompt) for a drafted article. Thin convenience over media's
 * `proposeHeroConcept` with the drafting-side proposer injected.
 */
export function proposeHero(
  input: HeroConceptInput,
  deps: ProposeHeroDeps,
): Promise<HeroConceptProposal> {
  return proposeHeroConcept(input, deps.proposer, deps.heroImage);
}

/**
 * Write hero alt-text into a draft's frontmatter (`heroImageAlt:`). Surgical —
 * only that line is touched. No-op on empty alt-text or content without
 * frontmatter.
 */
export function setHeroAlt(content: string, altText: string): string {
  if (!altText.trim()) return content;
  return upsertScalar(content, 'heroImageAlt', altText.trim());
}

/** Write the hero image path into a draft's frontmatter (`heroImage:`). */
export function setHeroImage(content: string, publicPath: string): string {
  if (!publicPath.trim()) return content;
  return upsertScalar(content, 'heroImage', publicPath.trim());
}

export interface GenerateHeroDeps {
  proposer: ConceptProposer;
  /** Image generator (gpt-image adapter, or a fake). */
  imageGen?: ImageGen;
  /** Where the bytes land (R2 adapter, or a fake). */
  objectStore?: ObjectStore;
  /** Asset slug — bytes live under `<slug>/` and the path threads into frontmatter. */
  slug: string;
  /** Hero style config. Default: media's `defaultMediaConfig.heroImage`. */
  heroImage?: HeroImageConfig;
  /** Capability gate — pass `pack.capabilities.heroImages`. Default `true`. */
  enabled?: boolean;
}

export interface GenerateHeroResult {
  /** The draft markdown, with `heroImage` + `heroImageAlt` written when generated. */
  content: string;
  /** Whether anything was generated + written (false on a gated/uncapable no-op). */
  changed: boolean;
  proposal?: HeroConceptProposal;
  image?: HeroImageResult;
}

/**
 * Full hero pipeline for a drafted article: propose a concept + alt-text,
 * generate the image bytes, persist them, and write both `heroImage` (the public
 * path) and `heroImageAlt` into the draft's frontmatter — the two fields the SEO
 * scorer rewards.
 *
 * A deliberate no-op (returns the content untouched, `changed: false`) when the
 * `heroImages` capability is off or no `ImageGen`/`ObjectStore` is wired, so a
 * host can call it unconditionally and let config decide.
 */
export async function generateHeroForDraft(
  content: string,
  deps: GenerateHeroDeps,
): Promise<GenerateHeroResult> {
  if (deps.enabled === false || !deps.imageGen || !deps.objectStore) {
    return { content, changed: false };
  }

  const input = heroInputFromMarkdown(content, deps.slug);
  const proposal = await proposeHeroConcept(input, deps.proposer, deps.heroImage);
  const image = await generateHeroImage(proposal.prompt, deps.imageGen, deps.objectStore, {
    slug: deps.slug,
    heroImage: deps.heroImage,
  });

  let out = content;
  if (image.publicPath) out = setHeroImage(out, image.publicPath);
  out = setHeroAlt(out, proposal.altText);

  return { content: out, changed: out !== content, proposal, image };
}
