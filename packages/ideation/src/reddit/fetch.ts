/**
 * Reddit reader — READ ONLY.
 *
 * Port of the fetch half of Body of Health `scripts/fetch-reddit-radar.mjs`.
 * Public listing/search endpoints only: `.json` first (richer: score and
 * comment counts), Atom `.rss` as the fallback. Reddit hard-403s datacenter
 * IPs on `.json` but only rate-limits feeds, so the RSS path retries on 429
 * with a growing backoff while the run's retry budget lasts.
 *
 * There is deliberately no write path. Every request goes through `get()`,
 * which sends GET and refuses any host that is not reddit.com. Automate
 * listening, never posting: replies are written by a person, with disclosure.
 */

import { hostIs, hostOf } from '@jeldon/config';

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  permalink: string;
  author: string;
  /** Unix seconds, or null. */
  created_utc: number | null;
  score: number | null;
  num_comments: number | null;
  selftext: string;
}

export interface RedditSource {
  jsonUrl: string;
  rssUrl: string;
  label: string;
}

const BASE = 'https://www.reddit.com';

/** URL builders for the four read surfaces the radar uses. */
export const redditSources = {
  subNew: (sub: string): RedditSource => ({
    jsonUrl: `${BASE}/r/${encodeURIComponent(sub)}/new.json?limit=50&raw_json=1`,
    rssUrl: `${BASE}/r/${encodeURIComponent(sub)}/new/.rss?limit=50`,
    label: `r/${sub}/new`,
  }),
  sitewideSearch: (term: string): RedditSource => {
    const q = encodeURIComponent(`"${term}"`);
    return {
      jsonUrl: `${BASE}/search.json?q=${q}&sort=new&t=year&limit=25&raw_json=1`,
      rssUrl: `${BASE}/search.rss?q=${q}&sort=new&t=year&limit=25`,
      label: `search "${term}"`,
    };
  },
  subTopWeek: (sub: string): RedditSource => ({
    jsonUrl: `${BASE}/r/${encodeURIComponent(sub)}/top.json?t=week&limit=25&raw_json=1`,
    rssUrl: `${BASE}/r/${encodeURIComponent(sub)}/top/.rss?t=week&limit=25`,
    label: `r/${sub}/top`,
  }),
  subSearchAllTime: (sub: string, query: string): RedditSource => {
    const q = encodeURIComponent(query);
    const s = encodeURIComponent(sub);
    return {
      jsonUrl: `${BASE}/r/${s}/search.json?q=${q}&restrict_sr=on&sort=top&t=all&limit=15&raw_json=1`,
      rssUrl: `${BASE}/r/${s}/search.rss?q=${q}&restrict_sr=on&sort=top&t=all&limit=15`,
      label: `r/${sub} top "${query}"`,
    };
  },
};

function unescapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Minimal Atom parser for Reddit's feed shape. Elements carry attributes
 * (`<content type="html">`), so the opening-tag match allows them; without
 * that the element silently reads as empty. RSS entries have no score or
 * comment counts: those stay null (never 0).
 */
export function parseAtom(xml: string): RedditPost[] {
  const posts: RedditPost[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const tag = (name: string) => entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ?? '';
    const published = tag('published');
    posts.push({
      id: tag('id').replace(/^t3_/, ''),
      subreddit: entry.match(/<category term="([^"]+)"/)?.[1] ?? '',
      title: unescapeXml(tag('title')),
      permalink: unescapeXml(entry.match(/<link href="([^"]+)"/)?.[1] ?? ''),
      author: tag('name').replace(/^\/u\//, ''),
      created_utc: published ? Date.parse(published) / 1000 : null,
      score: null,
      num_comments: null,
      selftext: unescapeXml(tag('content')).replace(/<[^>]+>/g, ' '),
    });
  }
  return posts;
}

export interface RedditReaderOptions {
  fetchImpl: typeof fetch;
  userAgent: string;
  rssRetryMs: number;
  maxRssRetries: number;
  /** Absolute epoch-ms after which no more retries are attempted. */
  retryDeadline: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  warn: (msg: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RedditReader {
  constructor(private readonly opts: RedditReaderOptions) {}

  /** The only network call. GET, reddit.com only. */
  private async get(url: string): Promise<Response> {
    if (!hostIs(hostOf(url), 'reddit.com')) throw new Error(`refusing non-reddit host: ${hostOf(url)}`);
    // Called as a plain function, not opts.fetchImpl(...): a bare global fetch
    // invoked as a method throws "Illegal invocation" on Cloudflare Workers.
    const fetchFn = this.opts.fetchImpl;
    return fetchFn(url, { method: 'GET', headers: { 'User-Agent': this.opts.userAgent } });
  }

  /** One logical source: JSON, then RSS. Null when every attempt failed. */
  async fetchPosts(src: RedditSource): Promise<RedditPost[] | null> {
    const { warn } = this.opts;
    const sleep = this.opts.sleep ?? defaultSleep;
    const now = this.opts.now ?? Date.now;
    try {
      const res = await this.get(src.jsonUrl);
      if (res.ok) {
        const body = (await res.json()) as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
        const children = body?.data?.children;
        if (Array.isArray(children)) {
          return children
            .map((c) => c?.data)
            .filter((d): d is Record<string, unknown> => !!d)
            .map((d) => ({
              id: String(d.id ?? ''),
              subreddit: String(d.subreddit ?? ''),
              title: String(d.title ?? ''),
              permalink: String(d.permalink ?? ''),
              author: String(d.author ?? ''),
              created_utc: typeof d.created_utc === 'number' ? d.created_utc : null,
              score: typeof d.score === 'number' ? d.score : null,
              num_comments: typeof d.num_comments === 'number' ? d.num_comments : null,
              selftext: String(d.selftext ?? ''),
            }));
        }
        warn(`${src.label}: unexpected JSON shape`);
      }
    } catch (err) {
      warn(`${src.label}: json ${(err as Error).message}`);
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.get(src.rssUrl);
        // A 200 with zero entries is a real result (no matches, a dead sub).
        if (res.ok) return parseAtom(await res.text());
        if (res.status !== 429) {
          warn(`${src.label}: rss HTTP ${res.status}`);
          return null;
        }
        const wait = this.opts.rssRetryMs * (attempt + 1);
        if (now() + wait > this.opts.retryDeadline || attempt >= this.opts.maxRssRetries) {
          warn(`${src.label}: rss rate-limited (retry budget spent)`);
          return null;
        }
        await sleep(wait);
      } catch (err) {
        warn(`${src.label}: rss ${(err as Error).message}`);
        return null;
      }
    }
  }
}
