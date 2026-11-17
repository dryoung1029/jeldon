import { defaultDraftingConfig, type DomainPack } from '@jeldon/config';
import type { LlmProvider, LlmRequest, LlmResponse } from '@jeldon/drafting';
import type { IdeationPack } from '../src/types.js';

export function makePack(over: Partial<IdeationPack> = {}): IdeationPack {
  return {
    brand: { name: 'Northwind Bikes', siteUrl: 'https://northwind.example', geoFraming: 'Lakeside and Hilltown' },
    authors: [
      { slug: 'sam', name: 'Sam Rivera', schemaId: 'https://northwind.example/#sam', profile: { name: 'Sam Rivera' }, isPrimary: true },
    ],
    voice: {
      persona: 'Dry, direct, first-person mechanic.',
      bannedTopics: ['crypto'],
      bannedPhrasings: ['game-changer'],
      rules: ['Never bury the lede.'],
      voiceAnchorUrls: [],
      readingGradeBand: [6, 9],
    },
    content: {
      categories: ['repair', 'buying'],
      categoryTargets: { repair: 80, buying: 80 },
      defaultAuthorSlug: 'sam',
      timezone: 'UTC',
    },
    drafting: defaultDraftingConfig,
    ...over,
  } as IdeationPack;
}

export function res(blocks: LlmResponse['blocks'], stopReason = 'tool_use'): LlmResponse {
  return { blocks, model: 'm', stopReason, usage: { input_tokens: 3, output_tokens: 4 } };
}

export function recordingProvider(reply: (req: LlmRequest) => LlmResponse, calls: LlmRequest[] = []): LlmProvider {
  return {
    async complete(req) {
      calls.push(req);
      return reply(req);
    },
    async stream() {
      throw new Error('unused');
    },
  };
}

export type { DomainPack };
