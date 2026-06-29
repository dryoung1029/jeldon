/**
 * The media surface's I/O contracts. Per docs/DECOUPLING-NOTES.md "Cloudflare
 * analytics … R2 proxies → ObjectStore": the R2 bucket, the TTS provider, and
 * the image provider all sit behind interfaces so the host wires the concrete
 * adapter (CF R2 binding, ElevenLabs, gpt-image) and tests use the null/fs
 * defaults. The engine never imports an SDK or a fetch URL directly outside the
 * adapter modules.
 */

/** A blob in the object store. */
export interface StoredObject {
  /** Raw bytes. */
  body: ArrayBuffer;
  contentType?: string;
}

/** Optional write metadata mirroring R2's `put` options. Adapters that don't
 *  support a field ignore it. */
export interface PutOptions {
  contentType?: string;
  cacheControl?: string;
  customMetadata?: Record<string, string>;
}

/**
 * Content-addressed blob storage — the only door to binary persistence (audio
 * MP3s, hero PNGs, prepass-cache JSON). Ported from the BoH R2 `IMAGES_BUCKET`
 * binding (`bucket.get` / `bucket.put`). Adapters: `R2ObjectStore` (wraps a CF
 * R2 binding), `NullObjectStore` (no-op, for synthesis-only or test paths).
 */
export interface ObjectStore {
  /** Read a blob. `null` when absent. */
  get(key: string): Promise<StoredObject | null>;
  /** Write a blob. */
  put(key: string, body: ArrayBuffer, opts?: PutOptions): Promise<void>;
}

/** One TTS request. Mirrors the ElevenLabs request shape, provider-neutral. */
export interface TtsRequest {
  /** Already-prepared (SSML-bearing) text. */
  text: string;
  voiceId: string;
  model: string;
  voiceSettings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
  /** Trailing context of the previous chunk, for prosody continuity. */
  previousText?: string;
  /** Leading context of the next chunk. */
  nextText?: string;
  /** Server-side pronunciation-dictionary locators (provider-specific). */
  pronunciationLocators?: Array<{ pronunciation_dictionary_id: string; version_id: string }>;
}

/**
 * Text-to-speech provider. Returns one MP3 byte buffer per request. Ported from
 * the BoH ElevenLabs `fetch` calls in `audio/[slug].ts`. Adapters:
 * `ElevenLabsTts` (HTTP), inject a fake in tests.
 */
export interface Tts {
  synthesize(req: TtsRequest): Promise<ArrayBuffer>;
}

/** One image-generation request. Mirrors the OpenAI images request, neutral. */
export interface ImageGenRequest {
  prompt: string;
  model: string;
  size: string;
  quality: string;
}

/**
 * Image generator. Returns the raw image bytes (the adapter decodes the
 * provider's base64). Ported from the BoH gpt-image `fetch` in
 * `image-generate/[slug].ts`. Adapters: `GptImageGen` (HTTP), fake in tests.
 */
export interface ImageGen {
  generate(req: ImageGenRequest): Promise<ArrayBuffer>;
}

/** Result of one narration generation. */
export interface SynthesizeResult {
  /** The joined MP3 (article chunks + outro). */
  audio: ArrayBuffer;
  /** Total spoken character count. */
  charCount: number;
  /** Number of chunks the body was split into. */
  chunkCount: number;
}

/** Result of one hero-image generation (bytes + the suggested public path). */
export interface HeroImageResult {
  /** Raw image bytes. */
  image: ArrayBuffer;
  /** Object-store key the bytes were written to (when a store was provided). */
  key?: string;
  /** Public proxy path the host serves the image from. */
  publicPath?: string;
  /** Content hash (first 6 hex) used in the filename. */
  hash: string;
}

/** A minimal article shape the podcast feed builder consumes. The host maps its
 *  own article model onto this — only the audio-relevant fields are needed. */
export interface FeedArticle {
  slug: string;
  title: string;
  excerpt: string;
  /** Site-relative or absolute audio URL. Articles without one are skipped. */
  audioUrl?: string;
  /** Absolute or site-relative hero image. */
  heroImage?: string;
  /** ISO date the audio was generated (preferred for pubDate). */
  audioGeneratedAt?: string;
  /** ISO publish date (pubDate fallback). */
  publishDate: string;
  /** MP3 byte size for the `<enclosure length>`. */
  audioFileSize?: number;
  /** Body char length, for the duration estimate. */
  audioBodyLength?: number;
}
