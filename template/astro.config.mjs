// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadDomainPack } from '@jeldon/config';
import { parse, isStub } from '@jeldon/content-model';
import { sitemapExcludedArticleUrls, sitemapFilter } from '@jeldon/schema-graph';

// The Domain Pack is the single source of every domain value — including the
// canonical host. Astro's config is evaluated in Node, so we load it with the
// shared jiti-based loader (no build step) rather than importing the TS file
// directly.
const pack = await loadDomainPack();

// Build the sitemap exclusion set. The engine owns the URL-building
// (`sitemapExcludedArticleUrls`) and the lifecycle predicate (`isStub`); the
// host owns only the fs walk + the shared frontmatter codec. Stubs (ready /
// scheduled) and any draft surfaced by an INCLUDE_DRAFTS=true preview build are
// excluded so an indexed preview can't leak unfinished work into search.
function articleStubs() {
  const dir = resolve('./src/content/articles');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const { frontmatter } = parse(readFileSync(resolve(dir, file), 'utf8'));
    const draft = frontmatter.draft === true;
    // A pure draft, a ready stub, or a scheduled stub all stay out of the
    // sitemap. `isStub` covers ready/scheduled; a pure draft is excluded too.
    out.push({ slug, isDraft: draft || isStub(frontmatter) });
  }
  return out;
}

const excluded = sitemapExcludedArticleUrls(articleStubs(), pack.brand.siteUrl);

export default defineConfig({
  site: pack.brand.siteUrl,
  output: 'static',
  // Astro's official adapter is the Cloudflare Workers adapter (Pages support
  // was dropped). The template bakes it in so every consumer inherits a current
  // config; `imageService: 'compile'` keeps the Workers bundle lean.
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [
    sitemap({
      filter: sitemapFilter(excluded),
    }),
  ],
});
