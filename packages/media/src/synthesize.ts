/**
 * `synthesize(text, voice, objectStore)` — the narration orchestrator. Ported
 * from the core of BoH `src/pages/api/admin/audio/[slug].ts` (the chunk → TTS
 * each chunk with prev/next context → append cached outro → concat MP3 streams
 * path), with three couplings broken:
 *   - GitHub read/write + frontmatter merge → NOT here (that's @jeldon/store;
 *     the host wires it around `synthesize`).
 *   - R2 bucket → `ObjectStore` interface (for the outro cache).
 *   - ElevenLabs `fetch` → `Tts` interface.
 *   - The Claude pronunciation pre-pass (`narration-prepass.ts`) → NOT ported;
 *     it's a drafting-side concern. See TODO(port) below.
 *
 * The host's audio route becomes: read article (store) → `synthesize` → write
 * audio (objectStore) + frontmatter (store). This function owns only the
 * speech-bytes assembly.
 */

import {
  defaultMediaConfig,
  type NarrationConfig,
} from '@jeldon/config';
import { chunkText, markdownToNarration, prepareForTts } from './narration.js';
import { concatBuffers, sha256HexText } from './hash.js';
import { NullObjectStore } from './object-store.js';
import type { ObjectStore, SynthesizeResult, Tts } from './types.js';

const DEFAULT_NARRATION = defaultMediaConfig.narration;

export interface SynthesizeOptions {
  /** Narration config (voice id, model, settings, pronunciation, caps). */
  narration?: NarrationConfig;
  /** Object store for the cross-article outro cache. Default: NullObjectStore
   *  (outro regenerated every call). */
  objectStore?: ObjectStore;
  /** Server-side pronunciation-dictionary locators (provider-specific). */
  pronunciationLocators?: Array<{ pronunciation_dictionary_id: string; version_id: string }>;
  /** Append the configured outro. Default true. */
  includeOutro?: boolean;
  /** Echo-back char count from preview; a >200 drift rejects (the BoH 409). */
  previewCharCount?: number;
}

/**
 * Generate narration audio for already-prepared narration text.
 *
 * Note this takes the FINAL narration text (post `markdownToNarration`), so a
 * caller controls exactly what's spoken. Use `synthesizeArticle` for the
 * convenience path that strips markdown first.
 */
export async function synthesize(
  narrationText: string,
  tts: Tts,
  opts: SynthesizeOptions = {},
): Promise<SynthesizeResult> {
  const cfg = opts.narration ?? DEFAULT_NARRATION;
  const objectStore = opts.objectStore ?? new NullObjectStore();
  const includeOutro = opts.includeOutro ?? true;

  const charCount = narrationText.length;
  if (charCount > cfg.maxChars) {
    throw new Error(
      `Narration would be ${charCount} chars, above safety cap (${cfg.maxChars}).`,
    );
  }
  if (opts.previewCharCount && Math.abs(charCount - opts.previewCharCount) > 200) {
    throw new Error(
      `Char count changed since preview (${opts.previewCharCount} → ${charCount}). Refresh preview and retry.`,
    );
  }

  const chunks = chunkText(narrationText, cfg.chunkChars);
  const audioParts: ArrayBuffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const buf = await tts.synthesize({
      text: chunks[i] as string,
      voiceId: cfg.voiceId,
      model: cfg.model,
      voiceSettings: cfg.voiceSettings,
      previousText: i > 0 ? (chunks[i - 1] as string).slice(-500) : undefined,
      nextText: i < chunks.length - 1 ? (chunks[i + 1] as string).slice(0, 500) : undefined,
      pronunciationLocators: opts.pronunciationLocators,
    });
    audioParts.push(buf);
  }

  if (includeOutro) {
    const outro = await getOrGenerateOutro(tts, cfg, objectStore, opts.pronunciationLocators);
    audioParts.push(outro);
  }

  return {
    audio: concatBuffers(audioParts),
    charCount,
    chunkCount: chunks.length,
  };
}

/**
 * Convenience: strip markdown to narration text first, then synthesize. This is
 * the shape the host audio route calls — pass the article body + title and the
 * config does the rest.
 */
export async function synthesizeArticle(
  body: string,
  title: string | undefined,
  tts: Tts,
  opts: SynthesizeOptions = {},
): Promise<SynthesizeResult> {
  const cfg = opts.narration ?? DEFAULT_NARRATION;
  const narrationText = markdownToNarration(body, title, cfg);
  return synthesize(narrationText, tts, opts);
}

/**
 * Generate (or cache-fetch) the standard outro. Cache key incorporates the
 * post-pronunciation text + voice settings + dict version so any change
 * auto-invalidates — verbatim BoH behavior. Cached in the object store at
 * `audio/_system/outro-<hash>.mp3`.
 */
export async function getOrGenerateOutro(
  tts: Tts,
  cfg: NarrationConfig,
  objectStore: ObjectStore,
  pronunciationLocators?: Array<{ pronunciation_dictionary_id: string; version_id: string }>,
): Promise<ArrayBuffer> {
  const outroSpeech = prepareForTts(cfg.outroText, cfg);
  const dictKey = pronunciationLocators?.[0]?.version_id ?? 'no-dict';
  const textHash = (
    await sha256HexText(outroSpeech + JSON.stringify(cfg.voiceSettings) + dictKey)
  ).slice(0, 8);
  const key = `audio/_system/outro-${textHash}.mp3`;

  const cached = await objectStore.get(key);
  if (cached) return cached.body;

  const buf = await tts.synthesize({
    text: outroSpeech,
    voiceId: cfg.voiceId,
    model: cfg.model,
    voiceSettings: cfg.voiceSettings,
    pronunciationLocators,
  });
  await objectStore.put(key, buf, {
    contentType: 'audio/mpeg',
    cacheControl: 'public, max-age=31536000, immutable',
    customMetadata: {
      purpose: 'outro',
      source: 'tts',
      voiceId: cfg.voiceId,
      model: cfg.model,
      textHash,
      generatedAt: new Date().toISOString(),
    },
  });
  return buf;
}

// TODO(port): the BoH audio route runs a Claude "pronunciation pre-pass"
// (src/lib/admin/narration-prepass.ts → analyzePronunciation / applySubstitutions),
// cached by body hash in R2 at `audio/_prepass/<hash>.json`, BEFORE
// markdownToNarration. It proposes phonetic substitutions for hazards the static
// rules miss. That's an LLM/drafting concern (it needs an Anthropic client + a
// prompt) — it belongs in @jeldon/drafting or a media-prepass adapter, not in
// this pure-synthesis core. The host can apply substitutions to `body` before
// calling synthesizeArticle. See src/pages/api/admin/audio/[slug].ts:62-78,245-274.
