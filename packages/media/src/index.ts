/**
 * @jeldon/media — the media surface: markdown→narration text prep, TTS
 * synthesis, hero-image generation, and the podcast feed builder.
 *
 * The pure text→speech core (`markdownToNarration`, `prepareForTts`,
 * `chunkText`) ports cleanly and is config-driven. The provider/storage edges
 * (ElevenLabs, gpt-image, R2) sit behind the `Tts`, `ImageGen`, and
 * `ObjectStore` interfaces with HTTP adapters + null defaults. Every domain
 * value (voice id/model/settings, pronunciation tables, the locked image style
 * pack, the podcast channel) is read from `pack.media` (→ `defaultMediaConfig`).
 *
 * Ported from BoH `narration.ts`, `audio/[slug].ts`, `image-generate/[slug].ts`,
 * `image-prompt/[slug].ts`, `podcast.xml.ts`. Gated by `capabilities.audio` /
 * `capabilities.heroImages`.
 */

// --- Narration text prep (pure core) ---
export {
  markdownToNarration,
  prepareForTts,
  chunkText,
  applyPronunciation,
  expandAbbreviations,
  expandNumericRanges,
  romanizeInContext,
  spellPhoneNumber,
} from './narration.js';

// --- Synthesis orchestration ---
export {
  synthesize,
  synthesizeArticle,
  getOrGenerateOutro,
  type SynthesizeOptions,
} from './synthesize.js';

// --- Hero images ---
export {
  generateHeroImage,
  assembleHeroPrompt,
  proposeHeroConcept,
  proposeImageTool,
  type GenerateHeroImageOptions,
  type HeroImageKind,
  type HeroConceptProposal,
  type HeroConceptInput,
  type ConceptProposer,
} from './hero-image.js';

// --- Podcast feed ---
export { buildPodcastFeed, type BuildFeedOptions } from './podcast.js';

// --- I/O adapters + interfaces ---
export {
  R2ObjectStore,
  NullObjectStore,
  type R2LikeBucket,
  type R2LikeObject,
} from './object-store.js';
export { ElevenLabsTts, type ElevenLabsTtsOptions } from './elevenlabs.js';
export { GptImageGen, base64ToArrayBuffer, type GptImageGenOptions } from './gpt-image.js';
export { sha256Hex, sha256HexText, concatBuffers } from './hash.js';

export type {
  ObjectStore,
  StoredObject,
  PutOptions,
  Tts,
  TtsRequest,
  ImageGen,
  ImageGenRequest,
  SynthesizeResult,
  HeroImageResult,
  FeedArticle,
} from './types.js';
