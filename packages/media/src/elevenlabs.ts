/**
 * ElevenLabs TTS adapter. A faithful port of the BoH `fetch` calls in
 * `src/pages/api/admin/audio/[slug].ts` — the request body (model_id,
 * voice_settings, previous_text/next_text, pronunciation_dictionary_locators)
 * and the `xi-api-key` / `Accept: audio/mpeg` headers are identical. The HTTP
 * call is isolated here so the rest of the engine talks only to the `Tts`
 * interface.
 */

import type { Tts, TtsRequest } from './types.js';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

export interface ElevenLabsTtsOptions {
  apiKey: string;
  /** Override the API base (proxy / mock). */
  baseUrl?: string;
  /** Injectable fetch (defaults to global). */
  fetchImpl?: typeof fetch;
}

export class ElevenLabsTts implements Tts {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ElevenLabsTtsOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? ELEVENLABS_BASE).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async synthesize(req: TtsRequest): Promise<ArrayBuffer> {
    const res = await this.fetchImpl(`${this.baseUrl}/${req.voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: req.text,
        model_id: req.model,
        voice_settings: req.voiceSettings,
        previous_text: req.previousText,
        next_text: req.nextText,
        pronunciation_dictionary_locators: req.pronunciationLocators,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ElevenLabs ${res.status}: ${errText}`);
    }
    return res.arrayBuffer();
  }
}
