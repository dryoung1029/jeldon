/**
 * @jeldon/amplify — domain-agnostic content amplification.
 *
 * `generateKit(article, pack, llm)` produces per-channel distribution copy.
 * `generateCarousel(…)` designs an IG text carousel; `CarouselSidecarStore`
 * persists the per-slide visual tweaks via `@jeldon/store`. `generateNewsletter
 * (…)` writes the subject+body. `BrevoClient` ({createScheduledCampaign, cancel,
 * sendNow, nextSendSlot}) is the single Brevo helper, with `resolveBrevoConfig`
 * collapsing the stored⊕env precedence.
 *
 * Every prompt, channel, scheme, and timezone is read from `pack.voice` +
 * `pack.amplify` — nothing about any vertical is hardcoded. The voice block is
 * built ONCE (`buildVoiceBlock`) and shared across kit/carousel/newsletter,
 * killing the BoH ×4 voice duplication.
 *
 * Ported from Body of Health: `api/admin/amplify/[slug].ts`,
 * `api/admin/carousel/[slug].ts`, `api/admin/carousel/state/[slug].ts`,
 * `brevo-campaigns.ts`, `brevo-config.ts`, `newsletter-content.ts`,
 * `scripts/auto-newsletter.mjs`.
 */

export { buildVoiceBlock } from './voice.js';

export {
  generateKit,
  regenerateChannel,
  buildKitSystem,
  type GenerateKitOptions,
  type RegenerateChannelOptions,
} from './kit.js';

export {
  generateCarousel,
  type GenerateCarouselOptions,
} from './carousel.js';

export {
  CarouselSidecarStore,
  type CarouselSidecar,
  type SidecarSlide,
  type SidecarHero,
  type SidecarBackdrop,
} from './carousel-store.js';

export {
  generateNewsletter,
  buildNewsletterSystem,
  type GenerateNewsletterOptions,
} from './newsletter.js';

export {
  BrevoClient,
  resolveBrevoConfig,
  resolveBrevoListId,
  type BrevoConfig,
  type BrevoStoredConfig,
  type CampaignParams,
  type ResolveBrevoConfigOptions,
} from './brevo.js';

export {
  AnthropicLlmClient,
  resolveModel,
  type AnthropicLlmClientOptions,
} from './llm.js';

export type {
  AmplifyArticle,
  AmplifyKit,
  GenerateKitResult,
  RegenerateChannelResult,
  CarouselSlide,
  GenerateCarouselResult,
  NewsletterContent,
  LlmClient,
  LlmTool,
  LlmToolRequest,
  LlmToolResponse,
  LlmUsage,
} from './types.js';
