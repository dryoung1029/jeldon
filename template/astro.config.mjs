// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Build-time code imports the LOADER entry (jiti + node:fs). Runtime routes
// import the root `@jeldon/config`, which is node:-free (Helix finding #8).
import { loadDomainPack } from '@jeldon/config/load';
import { parse, isStub } from '@jeldon/content-model';
import { sitemapExcludedArticleUrls, sitemapFilter } from '@jeldon/schema-graph';

// The Domain Pack is the single source of every domain value — including the
// canonical host and the article URL prefix.
const pack = await loadDomainPack();

// Build the sitemap exclusion set. The engine owns the URL-building
// (`sitemapExcludedArticleUrls`, which reads `content.articlePathPrefix`) and
// the lifecycle predicate (`isStub`); the host owns only the fs walk + the
// shared frontmatter codec. Stubs (ready / scheduled) and any draft surfaced by
// an INCLUDE_DRAFTS=true preview build are excluded so an indexed preview can't
// leak unfinished work into search.
function articleStubs() {
  const dir = resolve(pack.services.contentDir ?? './src/content/articles');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const { frontmatter } = parse(readFileSync(resolve(dir, file), 'utf8'));
    const draft = frontmatter.draft === true;
    out.push({ slug, isDraft: draft || isStub(frontmatter) });
  }
  return out;
}

const excluded = sitemapExcludedArticleUrls(articleStubs(), pack.brand.siteUrl, pack);

export default defineConfig({
  site: pack.brand.siteUrl,
  trailingSlash: 'always',
  // Static site. A server route opts out with `export const prerender = false`
  // and runs on Cloudflare Workers.
  output: 'static',
  // Astro's official adapter is the Cloudflare Workers adapter (Pages support
  // was dropped). `imageService: 'compile'` keeps the Workers bundle lean.
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [
    sitemap({
      filter: sitemapFilter(excluded),
    }),
  ],
  // The site doesn't use sessions. Without this the Cloudflare adapter wires a
  // KV binding named SESSION and warns on every build (Helix finding #6).
  session: { driver: 'memory' },
  build: { inlineStylesheets: 'auto' },
});
