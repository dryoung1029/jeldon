/**
 * Article queries, built on the engine's lifecycle state machine.
 *
 * `isLive` / `isStub` come from `@jeldon/content-model` — the host never
 * re-implements the draft → docReviewed → ready → scheduled → live rules.
 * `INCLUDE_DRAFTS=true` unlocks drafts for preview builds (the build-parity CI
 * gate exercises this path).
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { isLive, isStub } from '@jeldon/content-model';

export type ArticleEntry = CollectionEntry<'articles'>;

const includeDrafts = process.env.INCLUDE_DRAFTS === 'true';

/** The lifecycle booleans the engine predicates read, pulled from `entry.data`
 *  (Astro stores frontmatter there). The predicates own the rules — the host
 *  only points them at the right object. */
function flags(entry: ArticleEntry) {
  return {
    draft: entry.data.draft,
    docReviewed: entry.data.docReviewed,
    ready: entry.data.ready,
    scheduled: entry.data.scheduled,
  };
}

export async function getPublishedArticles(): Promise<ArticleEntry[]> {
  const all = await getCollection('articles');
  // `isLive` is `!draft`. `INCLUDE_DRAFTS=true` (preview builds) keeps drafts in.
  return all
    .filter((e) => includeDrafts || isLive(flags(e)))
    .sort((a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime());
}

export async function getStubArticles(): Promise<ArticleEntry[]> {
  const all = await getCollection('articles');
  // `isStub` is `draft && (ready || scheduled)` — Coming-soon pages that resolve
  // to a real URL so cross-links don't 404. Pure drafts never get a public stub.
  return all.filter((e) => isStub(flags(e)));
}

export function estimateReadTime(body: string): string {
  const words = body.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} MIN`;
}

export function formatPublishDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
