import type { AmplifyConfig, CarouselScheme, DomainPack } from '@jeldon/config';
import { defaultAmplifyConfig } from '@jeldon/config';
import { buildVoiceBlock } from './voice.js';
import type {
  AmplifyArticle,
  CarouselSlide,
  GenerateCarouselResult,
  LlmClient,
  LlmTool,
} from './types.js';

/**
 * IG text-carousel design. Ported from BoH `src/pages/api/admin/carousel/[slug].ts`.
 * The carousel *craft* prompt (hook/reveal/payoff playbook) is `pack.amplify
 * .carouselGuidance`; the voice paragraph is the shared `buildVoiceBlock(pack)`;
 * the color schemes are `pack.amplify.carouselSchemes`. The model picks one
 * scheme (or the caller overrides); the host renders the slides + an appended
 * hero slide.
 */

function resolveAmplify(pack: Pick<DomainPack, 'amplify'>): AmplifyConfig {
  return pack.amplify ?? defaultAmplifyConfig;
}

function buildCarouselSystem(pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>): string {
  const amplify = resolveAmplify(pack);
  return `${buildVoiceBlock(pack)}\n\n${amplify.carouselGuidance}`;
}

function buildCarouselTool(schemes: CarouselScheme[]): LlmTool {
  return {
    name: 'design_carousel',
    description:
      'Design a 5-7 slide carousel (text slides only — the hero slide is appended by the system with a user-selected CTA).',
    input_schema: {
      type: 'object',
      properties: {
        schemeName: {
          type: 'string',
          enum: schemes.map((s) => s.id),
          description:
            'One of the predefined color schemes. Pick the one that fits the article energy unless the user overrode.',
        },
        slides: {
          type: 'array',
          minItems: 5,
          maxItems: 7,
          items: {
            type: 'object',
            properties: {
              kicker: {
                type: 'string',
                description:
                  'Optional small label above body. e.g. "1/5", "THE MYTH", "BOTTOM LINE". Use sparingly.',
              },
              body: {
                type: 'string',
                description: 'The big centered text. 4-14 words. Headline energy.',
              },
              footer: {
                type: 'string',
                description:
                  'Optional small label below body. Rarely used. Source attribution or small subtitle.',
              },
            },
            required: ['body'],
          },
        },
      },
      required: ['schemeName', 'slides'],
    },
  };
}

export interface GenerateCarouselOptions {
  model?: string;
  maxTokens?: number;
  /** Force a specific scheme id regardless of what fits. */
  schemeOverride?: string;
  /** Refinement instruction for an iteration pass. */
  refinement?: string;
  /** The current slides — present + refinement triggers iteration mode. */
  currentSlides?: CarouselSlide[];
}

/** Generate (or iterate on) a carousel for an article. */
export async function generateCarousel(
  article: AmplifyArticle,
  pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>,
  llm: LlmClient,
  opts: GenerateCarouselOptions = {},
): Promise<GenerateCarouselResult> {
  const amplify = resolveAmplify(pack);
  const schemes = amplify.carouselSchemes;
  const byId = new Map(schemes.map((s) => [s.id, s]));

  const override = opts.schemeOverride && byId.has(opts.schemeOverride) ? opts.schemeOverride : undefined;
  const overrideBlock = override
    ? `\n\nUSER OVERRIDE: use the color scheme "${override}" (${byId.get(override)!.label}) regardless of which scheme would naturally fit.`
    : '';

  const isIteration =
    !!opts.refinement?.trim() && Array.isArray(opts.currentSlides) && opts.currentSlides.length > 0;
  const currentBlock = isIteration
    ? `\n\n<current_carousel>\n${opts
        .currentSlides!.map(
          (s, i) =>
            `Slide ${i + 1}: kicker=${JSON.stringify(s.kicker ?? '')}, body=${JSON.stringify(
              s.body ?? '',
            )}, footer=${JSON.stringify(s.footer ?? '')}`,
        )
        .join('\n')}\n</current_carousel>\n\nThe user is ITERATING on the carousel above — not starting fresh. Preserve every slide and field exactly unless the refinement below requires the change.`
    : '';
  const refinementBlock = opts.refinement?.trim()
    ? `\n\nUSER REFINEMENT: ${opts.refinement.trim()}`
    : '';
  const taskLine = isIteration
    ? 'Apply the refinement. Return ALL slides — unchanged slides should come back verbatim.'
    : '5-7 text slides plus the hero (added by system). Hook on slide 1, payoff on the last text slide. Pick a color scheme that matches the energy, unless overridden above.';

  const userMessage = `Article slug: ${article.slug}
Title: ${article.title}
Excerpt: ${article.excerpt ?? ''}

<article>
${article.body}
</article>${overrideBlock}${currentBlock}${refinementBlock}

${taskLine}`;

  const res = await llm.callTool({
    model: opts.model ?? 'sonnet',
    maxTokens: opts.maxTokens ?? 2500,
    system: buildCarouselSystem(pack),
    tool: buildCarouselTool(schemes),
    userMessage,
  });

  if (!res.input) {
    throw new Error(`Model returned no carousel (stop_reason: ${res.stopReason}).`);
  }

  const fallback = schemes[0]!;
  const chosenId = override ?? (res.input.schemeName as string);
  const scheme = byId.get(chosenId) ?? fallback;
  const slides = Array.isArray(res.input.slides) ? (res.input.slides as CarouselSlide[]) : [];
  const siteUrl = pack.brand.siteUrl.replace(/\/$/, '');

  return {
    schemeId: scheme.id,
    scheme,
    schemes,
    slides,
    heroImage: article.heroImage ?? null,
    heroImageAlt: article.heroImageAlt ?? null,
    title: article.title,
    slug: article.slug,
    articleUrl: `${siteUrl}/articles/${article.slug}/`,
    model: opts.model ?? 'sonnet',
    usage: res.usage,
  };
}
