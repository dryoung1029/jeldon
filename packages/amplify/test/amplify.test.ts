import { describe, expect, it } from 'vitest';
import type { AmplifyConfig, DomainPack } from '@jeldon/config';
import { defaultAmplifyConfig } from '@jeldon/config';
import type { DataFile, SaveResult, Store } from '@jeldon/store';
import {
  BrevoClient,
  CarouselSidecarStore,
  buildKitSystem,
  buildVoiceBlock,
  generateCarousel,
  generateKit,
  generateNewsletter,
  resolveBrevoConfig,
  type AmplifyArticle,
  type LlmClient,
  type LlmToolRequest,
  type LlmToolResponse,
} from '../src/index.js';

// --- fixtures ---------------------------------------------------------------

const article: AmplifyArticle = {
  slug: 'when-to-image-low-back-pain',
  title: 'When should you image low back pain?',
  excerpt: 'Imaging early rarely changes the plan.',
  category: 'evidence',
  tags: ['back-pain', 'imaging'],
  body: 'When I see a new patient with low back pain, the first question is rarely "do we image?"',
  heroImage: '/img/x/hero.png',
  heroImageAlt: 'A clinician reviewing an x-ray',
};

/** A minimal pack slice — just the fields the amplify surfaces read. */
function packWith(amplify: AmplifyConfig): Pick<DomainPack, 'voice' | 'brand' | 'amplify'> {
  return {
    brand: { name: 'Body of Health', siteUrl: 'https://yourbodyofhealth.com', geoFraming: 'Corvallis and Albany' },
    voice: {
      persona: 'Direct, evidence-informed, dry-with-a-pulse, first-person practitioner.',
      bannedTopics: ['subluxation theory', 'innate intelligence'],
      bannedPhrasings: ['studies have shown'],
      rules: ['Cheekiness encouraged where it fits.'],
      voiceAnchorUrls: ['/articles/history-of-chiropractic'],
      readingGradeBand: [7, 8],
    },
    amplify,
  };
}

/** A stub LLM that echoes the request and returns a canned tool input. */
function stubLlm(input: Record<string, unknown>): { client: LlmClient; calls: LlmToolRequest[] } {
  const calls: LlmToolRequest[] = [];
  const client: LlmClient = {
    async callTool(req: LlmToolRequest): Promise<LlmToolResponse> {
      calls.push(req);
      return { input, stopReason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } };
    },
  };
  return { client, calls };
}

// --- voice block (single read) ----------------------------------------------

describe('buildVoiceBlock', () => {
  it('reads persona, rules, banned topics, geo framing, and grade band from pack.voice', () => {
    const block = buildVoiceBlock(packWith(defaultAmplifyConfig));
    expect(block).toContain('first-person practitioner');
    expect(block).toContain('subluxation theory');
    expect(block).toContain('studies have shown');
    expect(block).toContain('Corvallis and Albany');
    expect(block).toContain('grade 7-8');
  });
});

// --- generateKit + UTM tagging ----------------------------------------------

describe('generateKit', () => {
  it('produces copy keyed by channel id and UTM-tags link channels only', async () => {
    const kitInput = {
      gbp: 'Visit https://yourbodyofhealth.com/articles/when-to-image-low-back-pain today',
      facebook: 'See https://yourbodyofhealth.com/articles/when-to-image-low-back-pain',
      instagram: 'link in bio — no url here',
      linkedin: 'Read https://yourbodyofhealth.com/articles/when-to-image-low-back-pain',
      newsletterSubject: 'When to image low back pain',
      newsletterBody: 'Read it: https://yourbodyofhealth.com/articles/when-to-image-low-back-pain',
      podcastHook: 'A deeper dive on imaging decisions.',
    };
    const { client, calls } = stubLlm(kitInput);
    const result = await generateKit(article, packWith(defaultAmplifyConfig), client);

    // GBP got its UTM, IG (no utm) did not.
    expect(result.kit.gbp).toContain('utm_source=gbp&utm_medium=organic');
    expect(result.kit.gbp).toContain('utm_campaign=when-to-image-low-back-pain');
    expect(result.kit.instagram).toBe('link in bio — no url here');
    // Subject is a noUrl channel — untouched, no utm.
    expect(result.kit.newsletterSubject).toBe('When to image low back pain');
    expect(result.meta.url).toBe('https://yourbodyofhealth.com/articles/when-to-image-low-back-pain');
    // The single voice block is in the system prompt sent to the model.
    expect(calls[0]!.system).toContain('first-person practitioner');
  });

  it('is config-driven: a different pack re-channels with no engine change', async () => {
    // A non-clinic domain: one channel, different UTM, different voice.
    const devopsAmplify: AmplifyConfig = {
      ...defaultAmplifyConfig,
      channels: [
        {
          id: 'mastodon',
          label: 'Mastodon post',
          utm: 'utm_source=mastodon&utm_medium=fedi',
          guidance: 'MASTODON: 500 chars, link at the end.',
          fieldDescription: 'Mastodon post, 500 chars + URL.',
        },
      ],
    };
    const { client } = stubLlm({
      mastodon: 'New post: https://yourbodyofhealth.com/articles/when-to-image-low-back-pain',
    });
    const result = await generateKit(article, packWith(devopsAmplify), client);
    expect(Object.keys(result.kit)).toEqual(['mastodon']);
    expect(result.kit.mastodon).toContain('utm_source=mastodon&utm_medium=fedi');
  });
});

// --- carousel ---------------------------------------------------------------

describe('generateCarousel', () => {
  it('returns slides + the chosen scheme from pack.amplify.carouselSchemes', async () => {
    const { client, calls } = stubLlm({
      schemeName: 'black-cream',
      slides: [{ body: 'Most back pain is not your spine' }, { body: 'It is how you load it' }],
    });
    const result = await generateCarousel(article, packWith(defaultAmplifyConfig), client);
    expect(result.schemeId).toBe('black-cream');
    expect(result.scheme.bg).toBe('#000000');
    expect(result.slides).toHaveLength(2);
    expect(result.articleUrl).toBe('https://yourbodyofhealth.com/articles/when-to-image-low-back-pain/');
    expect(calls[0]!.system).toContain('THE HOOK');
  });
});

// --- newsletter -------------------------------------------------------------

describe('generateNewsletter', () => {
  it('returns subject + body and injects the newsletter guidance', async () => {
    const { client, calls } = stubLlm({ subject: 'When to image', body: 'A short note.' });
    const result = await generateNewsletter(article, packWith(defaultAmplifyConfig), client);
    expect(result).toEqual({ subject: 'When to image', body: 'A short note.' });
    expect(calls[0]!.system).toContain('Subject line');
  });
});

// --- Brevo config + send slot -----------------------------------------------

describe('resolveBrevoConfig', () => {
  it('prefers stored values over env, requires the api key from env', () => {
    const config = resolveBrevoConfig({
      stored: { listId: 2, templateId: 5, senderName: 'BoH', senderEmail: 'n@x.com' },
      env: { BREVO_API_KEY: 'k', BREVO_LIST_ID: '99' },
    });
    expect(config.listId).toBe(2); // stored wins over env 99
    expect(config.apiKey).toBe('k');
  });

  it('throws when the api key is missing', () => {
    expect(() => resolveBrevoConfig({ env: {} })).toThrow(/BREVO_API_KEY/);
  });

  it('falls back to env when stored is absent', () => {
    const config = resolveBrevoConfig({
      env: {
        BREVO_API_KEY: 'k',
        BREVO_LIST_ID: '7',
        BREVO_NEWSLETTER_TEMPLATE_ID: '3',
        BREVO_SENDER_EMAIL: 'e@x.com',
      },
    });
    expect(config.listId).toBe(7);
    expect(config.templateId).toBe(3);
  });
});

describe('BrevoClient.nextSendSlot', () => {
  it('honors the 4-hour floor and lands on the configured hour', () => {
    // 6am PT publish → 10am PT same day (floor fits).
    const slot = BrevoClient.nextSendSlot(new Date('2026-06-29T13:00:00Z')); // 6am PDT
    const hourPT = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      hour12: false,
    }).format(slot);
    expect(Number(hourPT)).toBe(10);
    expect(slot.getTime()).toBeGreaterThan(new Date('2026-06-29T13:00:00Z').getTime());
  });
});

// --- carousel sidecar persistence via @jeldon/store -------------------------

/** In-memory Store — only the data-file methods are exercised here. */
function memStore(): Store {
  const files = new Map<string, string>();
  const notImpl = () => {
    throw new Error('not implemented in test');
  };
  return {
    listArticles: notImpl as Store['listArticles'],
    getArticle: notImpl as Store['getArticle'],
    saveArticle: notImpl as Store['saveArticle'],
    saveArticles: notImpl as Store['saveArticles'],
    deleteArticle: notImpl as Store['deleteArticle'],
    deleteArticles: notImpl as Store['deleteArticles'],
    async getDataFile(path: string): Promise<DataFile | null> {
      const content = files.get(path);
      if (content === undefined) return null;
      return { path, sha: `sha-${content.length}`, content };
    },
    async saveDataFile(path, content): Promise<SaveResult> {
      files.set(path, content);
      return { sha: `sha-${content.length}` };
    },
  };
}

describe('CarouselSidecarStore', () => {
  it('round-trips a sidecar through the Store and uses the pack state dir', async () => {
    const store = memStore();
    const sidecar = new CarouselSidecarStore(store, packWith(defaultAmplifyConfig));

    expect(await sidecar.get('x')).toEqual({ state: null, sha: null });

    await sidecar.put('x', { slides: [{ bodySize: 82, showLogo: true }] });
    const got = await sidecar.get('x');
    expect(got.state?.slides).toHaveLength(1);
    expect(got.state?.updatedAt).toBeTruthy();

    // Lands at the configured carousel state dir.
    const raw = await store.getDataFile('src/data/carousel-state/x.json');
    expect(raw).not.toBeNull();
  });
});
