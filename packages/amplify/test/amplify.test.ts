import { describe, expect, it } from 'vitest';
import type { AmplifyConfig, DomainPack } from '@jeldon/config';
import { defaultAmplifyConfig } from '@jeldon/config';
import type { Store } from '@jeldon/store';
import {
  BrevoClient,
  buildKitSystem,
  buildVoiceBlock,
  generateKit,
  generateNewsletter,
  importToCarouselStudio,
  scheduleArticleNewsletter,
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
    const slot = BrevoClient.nextSendSlot(new Date('2026-06-29T13:00:00Z'), 'America/Los_Angeles'); // 6am PDT
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


// --- reel channel + CTA policy ------------------------------------------------

describe('reel script channel', () => {
  it('ships in the defaults and the kit prompt carries the educational CTA rule', () => {
    const reel = defaultAmplifyConfig.channels.find((c) => c.id === 'reelScript');
    expect(reel?.guidance).toContain('260-320 words');
    expect(reel?.guidance).toContain('three numbered HOOK OPTIONS');
    const system = buildKitSystem(packWith(defaultAmplifyConfig));
    expect(system).toContain('CTA RULE for Reel / short video script');
    expect(system).toContain('book an appointment');
  });

  it('omits the CTA rule when no policy channel is in the kit', () => {
    const system = buildKitSystem(
      packWith({ ...defaultAmplifyConfig, channels: defaultAmplifyConfig.channels.filter((c) => c.id !== 'reelScript') }),
    );
    expect(system).not.toContain('CTA RULE');
  });

  it('keeps engine defaults free of any one brand', () => {
    const json = JSON.stringify(defaultAmplifyConfig);
    for (const literal of ['Body of Health', 'Dr. Young', 'PTCH', 'chiropract']) expect(json).not.toContain(literal);
  });
});

// --- carousel studio hand-off ------------------------------------------------

describe('importToCarouselStudio', () => {
  const config = {
    baseUrl: 'https://studio.example',
    brandId: 'acme',
    projectIdPrefix: 'acme',
    clientIdEnv: 'STUDIO_ID',
    clientSecretEnv: 'STUDIO_SECRET',
  };
  const env = { STUDIO_ID: 'id', STUDIO_SECRET: 'secret' };

  it('posts the contract payload with the service token and returns the studio URL', async () => {
    let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    const fetchImpl = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
      sent = { url, headers: init.headers, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ projectId: 'acme-x', studioUrl: 'https://studio.example/app/projects/acme-x' }));
    }) as unknown as typeof fetch;
    const r = await importToCarouselStudio(
      { slug: 'x', title: 'T', body: 'B', heroImage: '/img/x/h.png' },
      { config, env, siteUrl: 'https://acme.example/', fetchImpl },
    );
    expect(r).toEqual({ ok: true, projectId: 'acme-x', studioUrl: 'https://studio.example/app/projects/acme-x' });
    expect(sent!.url).toBe('https://studio.example/api/import-article');
    expect(sent!.headers['CF-Access-Client-Id']).toBe('id');
    expect(sent!.body).toMatchObject({
      projectId: 'acme-x',
      brandId: 'acme',
      heroImageUrl: 'https://acme.example/img/x/h.png',
      sourceUrl: 'https://acme.example/articles/x',
    });
  });

  it('refuses without secrets and treats an HTML auth page as a bad upstream', async () => {
    const missing = await importToCarouselStudio({ slug: 'x', title: 'T', body: 'B' }, { config, env: {}, siteUrl: 'https://a.example' });
    expect(missing).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    const html = (async () => new Response('<html>login</html>', { status: 200 })) as unknown as typeof fetch;
    const r = await importToCarouselStudio({ slug: 'x', title: 'T', body: 'B' }, { config, env, siteUrl: 'https://a.example', fetchImpl: html });
    expect(r).toMatchObject({ ok: false, code: 'BAD_UPSTREAM' });
  });
});

// --- Queue in Brevo ------------------------------------------------------------

function articleStore(initial: string) {
  let content = initial;
  const saves: string[] = [];
  const notImpl = () => {
    throw new Error('not implemented in test');
  };
  const store: Store = {
    listArticles: notImpl as Store['listArticles'],
    async getArticle(slug) {
      return { slug, path: `src/content/articles/${slug}.md`, sha: 'sha1', content };
    },
    async saveArticle(_slug, next) {
      content = next;
      saves.push(next);
      return { sha: 'sha2' };
    },
    saveArticles: notImpl as Store['saveArticles'],
    deleteArticle: notImpl as Store['deleteArticle'],
    deleteArticles: notImpl as Store['deleteArticles'],
    getDataFile: notImpl as Store['getDataFile'],
    saveDataFile: notImpl as Store['saveDataFile'],
  };
  return { store, saves, current: () => content };
}

describe('scheduleArticleNewsletter', () => {
  const pack = {
    brand: { name: 'Acme', siteUrl: 'https://acme.example' },
    content: { timezone: 'UTC' },
    amplify: defaultAmplifyConfig,
  } as unknown as Parameters<typeof scheduleArticleNewsletter>[2]['pack'];
  const brevo = (fail = false) => {
    const calls: Array<{ scheduledAt: Date; subject: string }> = [];
    return {
      calls,
      client: {
        async createScheduledCampaign(a: { scheduledAt: Date; subject: string }) {
          calls.push(a);
          return { campaignId: 42 };
        },
        async sendNow() {
          if (fail) throw new Error('boom');
        },
      } as unknown as Pick<BrevoClient, 'createScheduledCampaign' | 'sendNow'>,
    };
  };

  it('schedules at the cron slot and writes queued status to frontmatter', async () => {
    const s = articleStore('---\ntitle: "Hello"\ndraft: false\n---\nbody');
    const b = brevo();
    const now = new Date('2026-11-17T12:00:00Z');
    const r = await scheduleArticleNewsletter('hello', { subject: 'S', body: 'B' }, { store: s.store, brevo: b.client, pack, now });
    expect(r).toMatchObject({ ok: true, campaignId: 42, status: 'queued' });
    expect(b.calls[0]!.scheduledAt.toISOString()).toBe(BrevoClient.nextSendSlot(now, 'UTC', 10, 4).toISOString());
    expect(s.current()).toContain('newsletterStatus: queued');
    expect(s.current()).toContain('newsletterCampaignId:');
  });

  it('refuses drafts and already-queued articles without creating a campaign', async () => {
    const b = brevo();
    const draft = articleStore('---\ntitle: "x"\ndraft: true\n---\nbody');
    expect(await scheduleArticleNewsletter('x', { subject: 'S', body: 'B' }, { store: draft.store, brevo: b.client, pack })).toMatchObject({ ok: false, refused: 'draft' });
    const queued = articleStore('---\ntitle: "x"\nnewsletterStatus: queued\n---\nbody');
    expect(await scheduleArticleNewsletter('x', { subject: 'S', body: 'B' }, { store: queued.store, brevo: b.client, pack })).toMatchObject({ ok: false, refused: 'already-queued' });
    expect(b.calls).toHaveLength(0);
  });

  it('leaves a failed send-now queued with the error recorded', async () => {
    const s = articleStore('---\ntitle: "x"\n---\nbody');
    const r = await scheduleArticleNewsletter('x', { subject: 'S', body: 'B', sendNow: true }, { store: s.store, brevo: brevo(true).client, pack });
    expect(r).toMatchObject({ ok: false, status: 'queued', error: 'boom' });
    expect(s.current()).toContain('newsletterStatus: queued');
    expect(s.current()).toContain('sendNow failed: boom');
  });
});
