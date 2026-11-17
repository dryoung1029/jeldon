/**
 * YouTube caption fetcher — a `TranscriptFetcher` adapter. No dependencies;
 * runs on Workers and Node. Port of Body of Health
 * `src/lib/admin/youtube-transcript.ts`: fetch the watch page, parse the
 * embedded player JSON for caption tracks, prefer a manual track in the
 * preferred language, then parse the `<text start dur>` XML.
 *
 * Videos with captions disabled, age-gated or private videos throw a clear
 * error; `prepareTranscript` turns that into `fetch_failed` before any model
 * call.
 */

import type { FetchedTranscript, TranscriptFetcher, TranscriptSegment } from './transcript.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '');
      return ID_RE.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && ID_RE.test(v)) return v;
      const m = u.pathname.match(/\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2]!;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

export interface YoutubeTranscriptFetcherOptions {
  fetchImpl?: typeof fetch;
  preferLang?: string;
  userAgent?: string;
}

export class YoutubeTranscriptFetcher implements TranscriptFetcher {
  readonly kind = 'youtube';
  private readonly fetchImpl: typeof fetch;
  private readonly preferLang: string;
  private readonly ua: string;

  constructor(opts: YoutubeTranscriptFetcherOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.preferLang = opts.preferLang ?? 'en';
    this.ua = opts.userAgent ?? DEFAULT_UA;
  }

  canHandle(url: string): boolean {
    return extractVideoId(url) !== null;
  }

  async fetch(url: string): Promise<FetchedTranscript> {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('Could not extract a YouTube video ID from that URL.');
    const res = await this.fetchImpl(`https://www.youtube.com/watch?v=${videoId}&hl=${this.preferLang}`, {
      method: 'GET',
      headers: { 'User-Agent': this.ua, 'Accept-Language': `${this.preferLang};q=0.9` },
    });
    if (!res.ok) throw new Error(`YouTube fetch failed: ${res.status}`);
    const html = await res.text();

    let player: any = null;
    const m1 = html.match(/var ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});\s*var\s/);
    const m2 = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;[\s<]/);
    for (const m of [m1, m2]) {
      if (!m) continue;
      try {
        player = JSON.parse(m[1]!);
        break;
      } catch {
        /* keep trying */
      }
    }
    if (!player) throw new Error('Could not parse YouTube player JSON (page format may have changed).');

    const tracks: CaptionTrack[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    if (!tracks.length) {
      throw new Error('This video has no captions available. Pick one with captions, or paste the transcript instead.');
    }
    const score = (t: CaptionTrack) =>
      ((t.languageCode ?? '').toLowerCase().startsWith(this.preferLang.toLowerCase()) ? 10 : 0) + (t.kind === 'asr' ? 0 : 5);
    const chosen = [...tracks].sort((a, b) => score(b) - score(a))[0]!;

    const xmlRes = await this.fetchImpl(chosen.baseUrl, { method: 'GET', headers: { 'User-Agent': this.ua } });
    if (!xmlRes.ok) throw new Error(`Caption fetch failed: ${xmlRes.status}`);
    const xml = await xmlRes.text();

    const segments: TranscriptSegment[] = [];
    const re = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const start = parseFloat(m[1]!);
      const dur = m[2] ? parseFloat(m[2]) : 0;
      const text = decodeXmlEntities(m[3]!.replace(/\s+/g, ' ').trim());
      if (text) segments.push({ start, end: start + dur, text });
    }
    if (!segments.length) throw new Error('Caption track was empty.');

    return {
      url,
      title: player?.videoDetails?.title ?? null,
      channel: player?.videoDetails?.author ?? null,
      durationSeconds: player?.videoDetails?.lengthSeconds ? Number(player.videoDetails.lengthSeconds) : null,
      segments,
    };
  }
}
