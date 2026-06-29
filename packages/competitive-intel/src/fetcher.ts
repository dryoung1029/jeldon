import type { Fetcher, FetchResult } from './types.js';

/**
 * The default network boundary. Wraps global `fetch` with an optional
 * JS-rendering proxy (ScrapingBee) path — many competitor sites (vendor
 * templates, site builders) render content client-side and come back
 * near-empty via plain fetch, so a render proxy is the difference between a
 * scorable page and a blank one. Falls back to plain fetch on any proxy
 * error/empty result, or when no proxy key is configured.
 *
 * Ported verbatim from Body of Health `competitor-scanner.ts::fetchHtml`, with
 * the User-Agent and proxy key lifted into constructor options so a host
 * re-brands the crawler without touching engine code. A host that needs a
 * different rendering proxy, a cache, or a test double implements `Fetcher`.
 */
export interface FetcherOptions {
  /** User-Agent for plain fetches. Defaults to a generic Jeldon crawler UA. */
  userAgent?: string;
  /** ScrapingBee API key. When set, pages route through it with JS rendering. */
  scrapingBeeKey?: string;
  /** Plain-fetch abort timeout (ms). Default 15000. */
  plainTimeoutMs?: number;
  /** Proxy abort timeout (ms). Default 32000. */
  proxyTimeoutMs?: number;
  /**
   * Circuit breaker: when true and a proxy call fails once, the proxy is
   * disabled for the lifetime of this fetcher (the cron behavior — stop
   * burning credits + extra subrequests after the key proves bad). Default
   * false (per-call fallback, the on-demand Astro behavior).
   */
  disableProxyAfterFailure?: boolean;
}

const DEFAULT_UA = 'Mozilla/5.0 (compatible; JeldonCompetitiveIntelBot/1.0)';

export class DefaultFetcher implements Fetcher {
  private readonly userAgent: string;
  private readonly scrapingBeeKey?: string;
  private readonly plainTimeoutMs: number;
  private readonly proxyTimeoutMs: number;
  private readonly disableProxyAfterFailure: boolean;
  private proxyDisabled = false;

  constructor(opts: FetcherOptions = {}) {
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
    this.scrapingBeeKey = opts.scrapingBeeKey;
    this.plainTimeoutMs = opts.plainTimeoutMs ?? 15000;
    this.proxyTimeoutMs = opts.proxyTimeoutMs ?? 32000;
    this.disableProxyAfterFailure = opts.disableProxyAfterFailure ?? false;
  }

  async fetchHtml(url: string): Promise<FetchResult> {
    let proxyError: string | undefined;
    if (this.scrapingBeeKey && !this.proxyDisabled) {
      try {
        const api =
          `https://app.scrapingbee.com/api/v1/?api_key=${encodeURIComponent(this.scrapingBeeKey)}` +
          `&url=${encodeURIComponent(url)}&render_js=true&block_resources=false&timeout=20000`;
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), this.proxyTimeoutMs);
        const r = await fetch(api, { signal: ctrl.signal });
        clearTimeout(to);
        if (r.ok) {
          const html = await r.text();
          if (html && html.length > 200) {
            return {
              ok: true,
              status: 200,
              finalUrl: r.headers.get('spb-resolved-url') || url,
              html,
              via: 'proxy',
            };
          }
          proxyError = `empty/short response (${html.length} bytes)`;
        } else {
          proxyError = `HTTP ${r.status}`;
          try {
            const t = await r.text();
            if (t) proxyError += `: ${t.slice(0, 120)}`;
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        proxyError = `request failed: ${(e as Error).message}`;
      }
      if (this.disableProxyAfterFailure) this.proxyDisabled = true;
    }

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this.plainTimeoutMs);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(to);
      return { ok: r.ok, status: r.status, finalUrl: r.url || url, html: await r.text(), via: 'plain', proxyError };
    } catch (err) {
      clearTimeout(to);
      return { ok: false, status: 0, finalUrl: url, html: '', error: (err as Error).message, via: 'plain', proxyError };
    }
  }
}

export function defaultFetcher(opts: FetcherOptions = {}): Fetcher {
  return new DefaultFetcher(opts);
}
