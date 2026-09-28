/**
 * Small helpers around @jeldon/schema-graph for the kit's pages. The article
 * URL prefix comes from the Domain Pack (`content.articlePathPrefix`), so no
 * string rebasing is needed anywhere (Helix finding #3, fixed in the engine).
 */
import { articleGraph, breadcrumbList, extractFaqs, faqPage } from '@jeldon/schema-graph';
import { pack, authorEntries, categoryLabel, articlePath } from './pack';
import { labels, routes } from './kit';
import type { Article } from './content';

export function articleJsonLd(article: Article, body: string): Record<string, unknown>[] {
  const d = article.data;
  const nodes: Record<string, unknown>[] = [
    articleGraph(
      {
        title: d.title,
        slug: article.id,
        excerpt: d.excerpt,
        publishDate: d.publishDate,
        updatedDate: d.updatedDate,
        category: d.category,
        categoryLabel: categoryLabel(d.category),
        author: d.author,
        authorSlug: d.authorSlug,
        tags: d.tags,
        heroImage: d.heroImage,
        heroImageAlt: d.heroImageAlt,
        sourceEpisode: d.sourceEpisode,
      },
      authorEntries,
      pack,
    ) as Record<string, unknown>,
    breadcrumbList(
      [
        { name: 'Home', url: '/' },
        { name: labels.blog, url: routes.blog },
        { name: d.title, url: articlePath(article.id) },
      ],
      pack.brand.siteUrl,
    ) as Record<string, unknown>,
  ];
  const faqs = extractFaqs(body);
  if (faqs.length >= 2) nodes.push(faqPage(faqs) as Record<string, unknown>);
  return nodes;
}

/** Clamp a <title> to the SERP budget at a word boundary, never mid-word. */
export function clampTitle(text: string, max = 60): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  // Prefer a whole sentence, then a whole word; never a mid-word cut.
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence >= max * 0.4) return cut.slice(0, sentence + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut.slice(0, max)).replace(/[\s,;:\-–—]+$/, '');
}

export function crumbs(items: { name: string; url: string }[]): Record<string, unknown> {
  return breadcrumbList([{ name: 'Home', url: '/' }, ...items], pack.brand.siteUrl) as Record<string, unknown>;
}

export function faqJsonLd(faqs: { question: string; answer: string }[]): Record<string, unknown> | null {
  if (faqs.length < 2) return null;
  return faqPage(faqs.map((f) => ({ q: f.question, a: f.answer }))) as Record<string, unknown>;
}
