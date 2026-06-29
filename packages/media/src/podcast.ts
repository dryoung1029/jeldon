/**
 * `buildPodcastFeed(articles, channel)` — the iTunes-namespaced RSS builder.
 * Ported verbatim from BoH `src/pages/podcast.xml.ts`, with every channel
 * literal (title, description, author, owner email, category, cover, trailer)
 * read from `PodcastConfig` and the site URL threaded in once. Pure string
 * assembly, no I/O — the host wraps the returned XML in a Response.
 */

import { defaultMediaConfig, type PodcastConfig } from '@jeldon/config';
import type { FeedArticle } from './types.js';

const DEFAULT_PODCAST = defaultMediaConfig.podcast;

export interface BuildFeedOptions {
  /** Canonical site origin, e.g. `https://example.com` (no trailing slash). */
  siteUrl: string;
  /** Podcast channel config. Default: BoH. */
  podcast?: PodcastConfig;
  /** Override the feed self-URL. Default `${siteUrl}/podcast.xml`. */
  feedUrl?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Absolutize a possibly site-relative URL against the site origin. */
function abs(url: string, siteUrl: string): string {
  return url.startsWith('http') ? url : `${siteUrl}${url}`;
}

/** Rough duration estimate from char count. Off by ±15% per episode — fine for
 *  podcast-app display, doesn't affect playback. */
function estimateDurationSeconds(charCount: number | undefined, charsPerMinute: number): number {
  if (!charCount || charCount <= 0) return 0;
  return Math.round((charCount / charsPerMinute) * 60);
}

function formatDuration(sec: number): string {
  if (!sec) return '00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Build the full podcast RSS XML for every article with an `audioUrl`, plus the
 * configured trailer (if any). Articles without audio are skipped.
 */
export function buildPodcastFeed(articles: FeedArticle[], opts: BuildFeedOptions): string {
  const cfg = opts.podcast ?? DEFAULT_PODCAST;
  const site = opts.siteUrl.replace(/\/$/, '');
  const feedUrl = opts.feedUrl ?? `${site}/podcast.xml`;
  const cover = abs(cfg.coverImage, site);
  const cpm = cfg.charsPerMinute ?? 950;
  const lastBuildDate = new Date().toUTCString();

  const audioArticles = articles.filter((a) => a.audioUrl);

  const trailerItem = cfg.trailer
    ? (() => {
        const t = cfg.trailer!;
        const trailerUrl = abs(t.audioPath, site);
        return `    <item>
      <title>${esc(t.title)}</title>
      <link>${site}</link>
      <guid isPermaLink="false">${trailerUrl}</guid>
      <pubDate>${t.pubDate}</pubDate>
      <description>${esc(t.summary)}</description>
      <itunes:summary>${esc(t.summary)}</itunes:summary>
      <itunes:subtitle>${esc(t.summary.slice(0, 250))}</itunes:subtitle>
      <itunes:author>${esc(cfg.author)}</itunes:author>
      <itunes:duration>${t.duration}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>trailer</itunes:episodeType>
      <itunes:image href="${esc(cover)}" />
      <enclosure url="${esc(trailerUrl)}" length="${t.audioSize}" type="audio/mpeg" />
    </item>`;
      })()
    : '';

  const articleItems = audioArticles
    .map((a) => {
      const articleUrl = `${site}/articles/${a.slug}/`;
      const audioUrl = abs(a.audioUrl!, site);
      const pubDate = new Date(a.audioGeneratedAt ?? a.publishDate).toUTCString();
      const size = a.audioFileSize ?? 0;
      const duration = formatDuration(estimateDurationSeconds(a.audioBodyLength, cpm));
      const summary = a.excerpt;
      const episodeImage = a.heroImage ? abs(a.heroImage, site) : cover;

      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${articleUrl}</link>
      <guid isPermaLink="false">${audioUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${esc(summary)}</description>
      <itunes:summary>${esc(summary)}</itunes:summary>
      <itunes:subtitle>${esc(summary.slice(0, 250))}</itunes:subtitle>
      <itunes:author>${esc(cfg.author)}</itunes:author>
      <itunes:duration>${duration}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:image href="${esc(episodeImage)}" />
      <enclosure url="${esc(audioUrl)}" length="${size}" type="audio/mpeg" />
    </item>`;
    })
    .join('\n');

  const items = [trailerItem, articleItems].filter(Boolean).join('\n');

  const category = cfg.subcategory
    ? `    <itunes:category text="${esc(cfg.category)}">
      <itunes:category text="${esc(cfg.subcategory)}" />
    </itunes:category>`
    : `    <itunes:category text="${esc(cfg.category)}" />`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(cfg.title)}</title>
    <link>${site}</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    <description>${esc(cfg.description)}</description>
    <language>${esc(cfg.language ?? 'en-us')}</language>${
      cfg.copyright ? `\n    <copyright>${esc(cfg.copyright)}</copyright>` : ''
    }
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>Jeldon / @jeldon/media</generator>
    <itunes:author>${esc(cfg.author)}</itunes:author>
    <itunes:summary>${esc(cfg.description)}</itunes:summary>
    <itunes:subtitle>${esc(cfg.subtitle)}</itunes:subtitle>
    <itunes:type>episodic</itunes:type>
    <itunes:owner>
      <itunes:name>${esc(cfg.author)}</itunes:name>
      <itunes:email>${esc(cfg.ownerEmail)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${esc(cover)}" />
${category}
    <itunes:explicit>false</itunes:explicit>
${items}
  </channel>
</rss>
`;
}
