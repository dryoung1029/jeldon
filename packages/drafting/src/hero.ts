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
  proposeHeroConcept,
  type ConceptProposer,
  type HeroConceptInput,
  type HeroConceptProposal,
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
