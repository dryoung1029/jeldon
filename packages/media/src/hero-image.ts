/**
 * Hero-image generation. `generateHeroImage(prompt, objectStore)` ports the
 * core of BoH `src/pages/api/admin/image-generate/[slug].ts` — generate via the
 * `ImageGen` interface (gpt-image), content-hash the bytes, write to the object
 * store under the slug, return the public proxy path. The image PROVIDER and the
 * STORE are both behind interfaces.
 *
 * `assembleHeroPrompt` ports the locked-template fill from
 * `src/pages/api/admin/image-prompt/[slug].ts`: the `{TOPIC}` / `{CONCEPT}`
 * slots are filled server-side so the style template can never drift. The
 * Claude CONCEPT-proposal call itself is prompt-heavy LLM orchestration — see
 * the typed `proposeHeroConcept` stub + its TODO(port).
 */

import { defaultMediaConfig, type HeroImageConfig } from '@jeldon/config';
import { sha256Hex } from './hash.js';
import type { HeroImageResult, ImageGen } from './types.js';
import type { ObjectStore } from './types.js';

const DEFAULT_HERO = defaultMediaConfig.heroImage;

export type HeroImageKind = 'hero' | 'carousel-slide' | 'carousel-hero' | 'carousel-backdrop';

export interface GenerateHeroImageOptions {
  /** Image config (model/size/quality/style). Default: pack's, else BoH. */
  heroImage?: HeroImageConfig;
  /** Asset slug — the bytes live under `<slug>/...` in the store. */
  slug: string;
  /** Image purpose; non-hero kinds live under `<slug>/carousel/`. Default 'hero'. */
  kind?: HeroImageKind;
  /** Carousel slide index for non-hero kinds (folds into the filename). */
  slideIndex?: number;
  /** Override the size (else config). */
  size?: string;
  /** Override the quality (else config). */
  quality?: string;
}

/**
 * Generate a hero (or carousel) image from a fully-assembled prompt, persist it
 * to the object store, and return bytes + the public proxy path.
 *
 * Filename/key layout mirrors BoH exactly: hero stays at the slug root
 * (`<slug>/<slug>-hero-<hash>.png`, served `/img/<slug>/...`); carousel variants
 * live in `<slug>/carousel/` so they don't compete with article assets.
 */
export async function generateHeroImage(
  prompt: string,
  imageGen: ImageGen,
  objectStore: ObjectStore,
  opts: GenerateHeroImageOptions,
): Promise<HeroImageResult> {
  if (!prompt.trim()) throw new Error('Missing prompt');
  const cfg = opts.heroImage ?? DEFAULT_HERO;
  const kind: HeroImageKind = opts.kind ?? 'hero';
  const size = opts.size ?? cfg.size;
  const quality = opts.quality ?? cfg.quality;
  const slug = opts.slug;

  const image = await imageGen.generate({ prompt, model: cfg.model, size, quality });

  const hash = await sha256Hex(image);
  let filename: string;
  let key: string;
  if (kind === 'hero') {
    filename = `${slug}-hero-${hash.slice(0, 6)}.png`;
    key = `${slug}/${filename}`;
  } else {
    const idxPart = typeof opts.slideIndex === 'number' ? `-${opts.slideIndex}` : '';
    filename = `${kind}${idxPart}-${hash.slice(0, 6)}.png`;
    key = `${slug}/carousel/${filename}`;
  }

  await objectStore.put(key, image, {
    contentType: 'image/png',
    cacheControl: 'public, max-age=31536000, immutable',
    customMetadata: {
      slug,
      purpose: kind,
      source: cfg.model,
      quality,
      generatedAt: new Date().toISOString(),
    },
  });

  const publicPath =
    kind === 'hero' ? `/img/${slug}/${filename}` : `/img/${slug}/carousel/${filename}`;

  return { image, key, publicPath, hash: hash.slice(0, 6) };
}

/**
 * Fill the locked style template's `{TOPIC}` + `{CONCEPT}` slots. Done
 * server-side so the brand style can never drift through the model. Verbatim
 * BoH behavior (`PROMPT_TEMPLATE.replace`).
 */
export function assembleHeroPrompt(
  topic: string,
  concept: string,
  cfg: HeroImageConfig = DEFAULT_HERO,
): string {
  return cfg.promptTemplate.replace('{TOPIC}', topic).replace('{CONCEPT}', concept);
}

/** A proposed hero concept (the model's tool output). */
export interface HeroConceptProposal {
  topic: string;
  concept: string;
  altText: string;
  filename: string;
  rationale: string;
  /** The assembled full prompt (template + topic + concept). */
  prompt: string;
}

/** The article context the concept proposer reads. */
export interface HeroConceptInput {
  slug: string;
  title: string;
  category?: string;
  excerpt?: string;
  body: string;
  refinement?: string;
}

/**
 * Propose a hero CONCEPT for an article via an LLM, then assemble the full
 * prompt. The art-director SYSTEM prompt + the `propose_image` tool schema are
 * config (`heroImage.proposalSystem`) + the locked template; only the topic +
 * concept are model-authored.
 *
 * This is a typed stub: the actual Anthropic tool-call orchestration (the
 * `fetch` to /v1/messages with the propose_image tool, tool_choice forcing,
 * tool-use extraction) is prompt-heavy LLM plumbing that belongs with the
 * drafting layer's Anthropic client, not in this media package. Wire a
 * `ConceptProposer` (one method) to a real client to activate it.
 *
 * TODO(port): implement against the shared Anthropic client used by
 * @jeldon/drafting. The faithful source is
 * src/pages/api/admin/image-prompt/[slug].ts:139-214 — SYSTEM + TOOL constants
 * are already lifted into `heroImage.proposalSystem` and the `proposeImageTool`
 * export below; this just needs the messages call + tool-use parse.
 */
export async function proposeHeroConcept(
  input: HeroConceptInput,
  proposer: ConceptProposer,
  cfg: HeroImageConfig = DEFAULT_HERO,
): Promise<HeroConceptProposal> {
  const refinementBlock = input.refinement?.trim()
    ? `\n\nUSER REFINEMENT: ${input.refinement.trim()}`
    : '';
  const userMessage = `Slug: ${input.slug}
Title: ${input.title}
Category: ${input.category ?? ''}
Excerpt: ${input.excerpt ?? ''}

<article>
${input.body}
</article>${refinementBlock}

Decide the topic + visual concept for this article's hero illustration. The style is locked — focus on what to draw.`;

  const fields = await proposer.propose({
    system: cfg.proposalSystem,
    tool: proposeImageTool,
    userMessage,
  });

  const prompt = assembleHeroPrompt(fields.topic, fields.concept, cfg);
  return { ...fields, prompt };
}

/** One LLM round-trip that returns the propose_image tool fields. Inject a real
 *  Anthropic-backed implementation to activate `proposeHeroConcept`. */
export interface ConceptProposer {
  propose(req: {
    system: string;
    tool: typeof proposeImageTool;
    userMessage: string;
  }): Promise<{
    topic: string;
    concept: string;
    altText: string;
    filename: string;
    rationale: string;
  }>;
}

/** The `propose_image` tool schema, lifted verbatim from BoH image-prompt route. */
export const proposeImageTool = {
  name: 'propose_image',
  description:
    'Fill the topic + visual concept blanks in the locked master template, plus alt text and filename.',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Short noun phrase, 3-10 words, naming what the article is about.',
      },
      concept: {
        type: 'string',
        description:
          '2-4 sentences describing the specific visual idea to draw. Include where 1-2 accent colors go.',
      },
      altText: {
        type: 'string',
        description: '8-15 word alt text describing what the image will show.',
      },
      filename: {
        type: 'string',
        description: 'Lowercase hyphen-separated filename with .webp extension.',
      },
      rationale: {
        type: 'string',
        description: 'One short sentence: why this visual concept fits the article.',
      },
    },
    required: ['topic', 'concept', 'altText', 'filename', 'rationale'],
  },
} as const;
