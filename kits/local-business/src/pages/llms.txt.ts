/**
 * /llms.txt — a short, curated description of the site for AI crawlers,
 * rendered from jeldon.config.ts → schema.llmsTxt at build time, plus the list
 * of published articles so answer engines find them without crawling.
 */
import type { APIRoute } from 'astro';
import { emitLlmsTxt } from '@jeldon/schema-graph';
import { pack, articlePath } from '../lib/pack';
import { getPublishedArticles } from '../lib/content';

export const GET: APIRoute = async () => {
  const { contents, emitted } = await emitLlmsTxt(pack);
  if (!emitted) return new Response('Not found', { status: 404 });
  const articles = await getPublishedArticles();
  const site = pack.brand.siteUrl.replace(/\/$/, '');
  const list = articles.length
    ? ['', '## Articles', ...articles.map((a) => `- [${a.data.title}](${site}${articlePath(a.id)}): ${a.data.excerpt}`), ''].join('\n')
    : '';
  return new Response(contents + list, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
