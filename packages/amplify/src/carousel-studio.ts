import type { CarouselStudioConfig } from '@jeldon/config';
import type { AmplifyArticle } from './types.js';

/**
 * Hand an article to an external carousel studio. Ported from BoH
 * `src/pages/api/admin/carousel-import/[slug].ts` (contract:
 * `docs/carousel-studio-import-contract.md`). The studio distills the brief,
 * generates slides, ingests the hero image and upserts a project keyed by
 * `projectId`; it returns `{ projectId, studioUrl }`. The engine renders
 * nothing.
 *
 * Run this server-side only: it sends the service-token secret.
 */

export type CarouselStudioErrorCode =
  | 'NOT_CONFIGURED'
  | 'TIMEOUT'
  | 'UNREACHABLE'
  | 'BAD_UPSTREAM'
  | 'UPSTREAM_ERROR';

export type CarouselStudioResult =
  | { ok: true; projectId: string; studioUrl: string }
  | { ok: false; code: CarouselStudioErrorCode; error: string; status?: number; stage?: string };

export interface ImportToCarouselStudioOptions {
  config: CarouselStudioConfig;
  /** Public site origin, for `sourceUrl` and a relative hero path. */
  siteUrl: string;
  /** Env bag holding the service-token pair named in `config`. */
  env: Record<string, string | undefined>;
  /** Claims already verified on our side; the studio reproduces these verbatim. */
  verifiedFacts?: string[];
  notes?: string;
  /** Path prefix for article URLs. Default `/articles/`. */
  articlePathPrefix?: string;
  fetchImpl?: typeof fetch;
}

export async function importToCarouselStudio(
  article: Pick<AmplifyArticle, 'slug' | 'title' | 'body' | 'heroImage'>,
  opts: ImportToCarouselStudioOptions,
): Promise<CarouselStudioResult> {
  const { config } = opts;
  const clientId = opts.env[config.clientIdEnv];
  const clientSecret = opts.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      error: `Carousel studio service-token secrets are not set (${config.clientIdEnv} / ${config.clientSecretEnv}).`,
    };
  }
  const site = opts.siteUrl.replace(/\/$/, '');
  const prefix = (opts.articlePathPrefix ?? '/articles/').replace(/^\/?/, '/').replace(/\/?$/, '/');
  const hero = article.heroImage;
  const heroImageUrl = hero ? (/^https?:\/\//.test(hero) ? hero : `${site}${hero.startsWith('/') ? '' : '/'}${hero}`) : undefined;

  const payload: Record<string, unknown> = {
    projectId: `${config.projectIdPrefix}-${article.slug}`,
    title: article.title || article.slug,
    articleText: article.body,
    brandId: config.brandId,
    sourceUrl: `${site}${prefix}${article.slug}`,
    verifiedFacts: opts.verifiedFacts ?? [],
  };
  if (heroImageUrl) payload.heroImageUrl = heroImageUrl;
  if (config.schemeName) payload.schemeName = config.schemeName;
  if (opts.notes) payload.notes = opts.notes;

  const timeoutMs = config.timeoutMs ?? 88_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${config.baseUrl.replace(/\/$/, '')}/api/import-article`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': clientId,
        'CF-Access-Client-Secret': clientSecret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError';
    return aborted
      ? { ok: false, code: 'TIMEOUT', stage: 'studio', error: `Carousel studio did not respond within ${Math.round(timeoutMs / 1000)}s.` }
      : { ok: false, code: 'UNREACHABLE', stage: 'studio', error: `Could not reach the carousel studio: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }

  // The studio answers JSON on success and on error. An auth layer in front
  // of it can answer HTML; treat that as a bad upstream, not a success.
  const raw = await res.text();
  let data: { projectId?: unknown; studioUrl?: unknown; error?: unknown; code?: unknown; stage?: unknown } | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!data) {
    return { ok: false, code: 'BAD_UPSTREAM', status: res.status, stage: 'studio', error: `Carousel studio returned HTTP ${res.status} with a non-JSON body.` };
  }
  if (!res.ok) {
    return {
      ok: false,
      code: 'UPSTREAM_ERROR',
      status: res.status,
      stage: typeof data.stage === 'string' ? data.stage : 'studio',
      error: typeof data.error === 'string' ? data.error : `Carousel studio returned HTTP ${res.status}.`,
    };
  }
  if (typeof data.projectId !== 'string' || typeof data.studioUrl !== 'string') {
    return { ok: false, code: 'BAD_UPSTREAM', status: res.status, stage: 'studio', error: 'Carousel studio response is missing projectId or studioUrl.' };
  }
  return { ok: true, projectId: data.projectId, studioUrl: data.studioUrl };
}
