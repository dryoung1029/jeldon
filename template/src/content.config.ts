/**
 * Content collections — Astro 5 content layer (Helix finding #7: the legacy
 * `type: 'content'` API with `.slug` / `entry.render()` is gone; entries have
 * `id` and are rendered with `render()` from `astro:content`).
 *
 * The article schema is DERIVED from the Domain Pack: the single field the
 * source system hardcoded in five places (the `category` enum) is built here
 * from `pack.content.categories` via `@jeldon/content-model`'s
 * `buildArticleSchema`. Add a category in `jeldon.config.ts` and it flows to
 * the schema, the scorer, the CI gates, and the prompts — one list, no mirrors.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { buildArticleSchema } from '@jeldon/content-model';
import { pack } from './lib/pack';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: `./${pack.services.contentDir ?? 'src/content/articles'}` }),
  schema: buildArticleSchema(pack),
});

export const collections = { articles };
