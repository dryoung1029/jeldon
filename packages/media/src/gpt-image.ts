/**
 * OpenAI gpt-image adapter. A faithful port of the BoH `fetch` in
 * `src/pages/api/admin/image-generate/[slug].ts` — same endpoint, same request
 * shape (model, prompt, n:1, size, quality), same base64 decode. Isolated here
 * so the hero-image flow talks only to the `ImageGen` interface.
 */

import type { ImageGen, ImageGenRequest } from './types.js';

const OPENAI_IMAGES = 'https://api.openai.com/v1/images/generations';

export interface GptImageGenOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class GptImageGen implements ImageGen {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GptImageGenOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? OPENAI_IMAGES;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(req: ImageGenRequest): Promise<ArrayBuffer> {
    const res = await this.fetchImpl(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        prompt: req.prompt,
        n: 1,
        size: req.size,
        quality: req.quality,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image data');
    return base64ToArrayBuffer(b64);
  }
}

/** Decode a base64 string to bytes. Uses `atob` (present in Workers + browsers
 *  + modern Node globals) to avoid a node:buffer import. */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
