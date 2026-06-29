import { describe, expect, it } from 'vitest';
import { defaultMediaConfig, type NarrationConfig, type PodcastConfig } from '@jeldon/config';
import {
  buildPodcastFeed,
  chunkText,
  markdownToNarration,
  prepareForTts,
  synthesize,
  type FeedArticle,
  type Tts,
} from '../src/index.js';

const body = `# Low back pain and imaging

When I see a new patient, the first question is rarely "do we image?"

## Why imaging early usually does not help

Routine imaging does not improve outcomes [1]. Call 541-753-1287 to book.

## References

Chou et al, 2007. [PubMed](https://pubmed.ncbi.nlm.nih.gov/17909209/)
`;

describe('narration text prep (default health pack)', () => {
  it('strips the references section, drops H2s, and spells the phone number', () => {
    const out = markdownToNarration(body, 'Imaging and low back pain');
    expect(out).not.toMatch(/References/i);
    expect(out).not.toMatch(/pubmed/i);
    expect(out).not.toMatch(/##/);
    // Phone digits spelled out, not left as 541-753-1287.
    expect(out).toMatch(/five four one/);
    expect(out).not.toMatch(/\[1\]/);
  });

  it('wraps default IPA override words in <phoneme> tags', () => {
    const out = prepareForTts('We treat musculoskeletal pain in Corvallis.');
    expect(out).toMatch(/<phoneme alphabet="ipa" ph="[^"]+">musculoskeletal<\/phoneme>/);
    expect(out).toMatch(/<phoneme alphabet="ipa" ph="[^"]+">Corvallis<\/phoneme>/);
  });

  it('chunks at the configured boundary without splitting mid-word', () => {
    const long = Array.from({ length: 20 }, (_, i) => `Paragraph number ${i} has several words.`).join('\n\n');
    const chunks = chunkText(long, 80);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(80 + 40);
    expect(chunks.join(' ')).toContain('Paragraph number 19');
  });
});

describe('config-driven portability (no engine code changes)', () => {
  it('applies a DIFFERENT domain pronunciation table + reference names', () => {
    const devopsNarration: NarrationConfig = {
      ...defaultMediaConfig.narration,
      pronunciationOverrides: [{ word: 'Kubernetes', ipa: 'ˌkubərˈnɛtiz' }],
      abbreviationExpansions: [{ abbr: 'API', full: 'A P I' }],
      referenceSectionNames: ['appendix'],
    };
    const devBody = `Body about Kubernetes and the API gateway.

## Appendix

Internal-only notes that should be dropped.`;
    const out = markdownToNarration(devBody, undefined, devopsNarration);
    // The dev pack's overrides fire; the health pack's Corvallis/skeletal do not.
    expect(out).toMatch(/<phoneme alphabet="ipa" ph="ˌkubərˈnɛtiz">Kubernetes<\/phoneme>/);
    expect(out).toMatch(/A P I/);
    // The dev pack's "appendix" reference-section name truncates the body.
    expect(out).not.toMatch(/Internal-only notes/);
  });
});

describe('synthesize orchestration (fake TTS, null store)', () => {
  it('synthesizes each chunk + the outro and concatenates the bytes', async () => {
    const calls: string[] = [];
    const fakeTts: Tts = {
      async synthesize(req) {
        calls.push(req.text.slice(0, 12));
        return new TextEncoder().encode(req.text).buffer as ArrayBuffer;
      },
    };
    const text = markdownToNarration('Short body that fits in one chunk.', 'Title');
    const result = await synthesize(text, fakeTts);
    expect(result.chunkCount).toBe(1);
    // One body chunk + the outro = 2 TTS calls.
    expect(calls.length).toBe(2);
    expect(result.charCount).toBe(text.length);
    expect(result.audio.byteLength).toBeGreaterThan(0);
  });

  it('rejects when the char count drifts from the preview', async () => {
    const fakeTts: Tts = {
      async synthesize() {
        return new ArrayBuffer(8);
      },
    };
    // Drift only rejects when |actual - preview| > 200 (BoH 409 semantics).
    await expect(
      synthesize('a much longer narration string than was previewed', fakeTts, {
        previewCharCount: 500,
      }),
    ).rejects.toThrow(/changed since preview/);
  });
});

describe('podcast feed (config-driven channel)', () => {
  const articles: FeedArticle[] = [
    {
      slug: 'imaging-low-back-pain',
      title: 'Imaging & low back pain',
      excerpt: 'When an x-ray earns its place.',
      audioUrl: '/audio/imaging-low-back-pain/imaging-abc123.mp3',
      heroImage: '/img/imaging-low-back-pain/hero.png',
      audioGeneratedAt: '2026-06-01T00:00:00Z',
      publishDate: '2026-05-30',
      audioFileSize: 4096,
      audioBodyLength: 9500,
    },
    {
      slug: 'no-audio-article',
      title: 'No audio here',
      excerpt: 'Skipped — no audioUrl.',
      publishDate: '2026-05-29',
    },
  ];

  it('emits one item per audio article + the trailer, escaping XML', () => {
    const xml = buildPodcastFeed(articles, { siteUrl: 'https://example.com' });
    expect(xml).toContain('<itunes:author>Dr. Jason Young, DC</itunes:author>');
    expect(xml).toContain('Imaging &amp; low back pain'); // & escaped
    expect(xml).toContain('https://example.com/audio/imaging-low-back-pain/imaging-abc123.mp3');
    expect(xml).toContain('episodeType>trailer'); // default pack has a trailer
    expect(xml).not.toContain('no-audio-article'); // skipped
  });

  it('re-channels with a different podcast config (different domain)', () => {
    const devPodcast: PodcastConfig = {
      ...defaultMediaConfig.podcast,
      title: 'Northwatch Incident Review',
      author: 'SRE on-call',
      category: 'Technology',
      subcategory: undefined,
      trailer: undefined,
    };
    const xml = buildPodcastFeed(articles, {
      siteUrl: 'https://northwatch.example',
      podcast: devPodcast,
    });
    expect(xml).toContain('<title>Northwatch Incident Review</title>');
    expect(xml).toContain('<itunes:author>SRE on-call</itunes:author>');
    expect(xml).not.toContain('episodeType>trailer'); // no trailer in this pack
    // Single-level category (no subcategory).
    expect(xml).toMatch(/<itunes:category text="Technology" \/>/);
  });
});
