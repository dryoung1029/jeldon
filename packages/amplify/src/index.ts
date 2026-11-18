/**
 * @jeldon/amplify — domain-agnostic content amplification.
 *
 * `generateKit(article, pack, llm)` produces per-channel distribution copy
 * (including a spoken reel script under an educational-CTA policy).
 * `importToCarouselStudio(…)` hands an article to an external carousel studio
 * (the in-page carousel builder was retired). `generateNewsletter(…)` writes
 * the subject+body; `scheduleArticleNewsletter(…)` queues it in Brevo. `BrevoClient` ({createScheduledCampaign, cancel,
 * sendNow, nextSendSlot}) is the single Brevo helper, with `resolveBrevoConfig`
 * collapsing the stored⊕env precedence.
 *
 * Every prompt, channel and timezone is read from `pack.voice` +
 * `pack.amplify` — nothing about any vertical is hardcoded. The voice block is
 * built ONCE (`buildVoiceBlock`) and shared across kit/newsletter,
 * killing the BoH ×4 voice duplication.
 *
 * Ported from Body of Health: `api/admin/amplify/[slug].ts`,
 * `api/admin/carousel-import/[slug].ts`, `api/admin/newsletter/[slug]/schedule.ts`,
 * `brevo-campaigns.ts`, `brevo-config.ts`, `newsletter-content.ts`,
 * `scripts/auto-newsletter.mjs`.
 */

export { buildVoiceBlock } from './voice.js';

export {
  generateKit,
  regenerateChannel,
  buildKitSystem,
  ctaPolicyBlock,
  type GenerateKitOptions,
  type RegenerateChannelOptions,
} from './kit.js';

export {
  importToCarouselStudio,
  type CarouselStudioResult,
  type CarouselStudioErrorCode,
  type ImportToCarouselStudioOptions,
} from './carousel-studio.js';

export {
  scheduleArticleNewsletter,
  type ScheduleNewsletterInput,
  type ScheduleNewsletterDeps,
  type ScheduleNewsletterResult,
  type NewsletterRefusal,
} from './newsletter-schedule.js';

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
  NewsletterContent,
  LlmClient,
  LlmTool,
  LlmToolRequest,
  LlmToolResponse,
  LlmUsage,
} from './types.js';
