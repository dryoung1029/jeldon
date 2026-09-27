import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { DomainPack } from '@jeldon/config';
import { loadDomainPack } from '@jeldon/config/load';
import { calculateGeo, calculateSeo, fleschKincaidGrade, type ScoreResult } from '@jeldon/core-scoring';
import { parse } from '@jeldon/content-model';

export interface ScoreFileReport {
  file: string;
  slug: string;
  category: string;
  /** The GEO target this article is measured against (category target, else floor). */
  target: number;
  geo: ScoreResult;
  seo: ScoreResult;
  /** Flesch-Kincaid grade of the body, or null for an empty body. */
  grade: number | null;
  draft: boolean;
}

/** Pure: score one raw markdown document against a pack. Same scorer as the
 *  editor dial and the CI gate — nothing is re-implemented here. */
export function scoreDocument(raw: string, path: string, pack: DomainPack): ScoreFileReport {
  const { frontmatter, body } = parse(raw);
  const slug = basename(path, '.md');
  const input = {
    title: String(frontmatter.title ?? ''),
    excerpt: String(frontmatter.excerpt ?? ''),
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    body,
    slug,
    heroImage: typeof frontmatter.heroImage === 'string' ? frontmatter.heroImage : undefined,
    heroImageAlt: typeof frontmatter.heroImageAlt === 'string' ? frontmatter.heroImageAlt : undefined,
  };
  const category = String(frontmatter.category ?? '');
  return {
    file: path,
    slug,
    category,
    target: pack.content.categoryTargets[category] ?? pack.scoring.geo.floor,
    geo: calculateGeo(input, pack.scoring.geo),
    seo: calculateSeo(input, pack.scoring.seo),
    grade: fleschKincaidGrade(body),
    draft: frontmatter.draft === true,
  };
}

export async function runScore(opts: { cwd?: string; file: string }): Promise<ScoreFileReport> {
  const cwd = opts.cwd ?? process.cwd();
  const pack = await loadDomainPack({ cwd });
  const path = resolve(cwd, opts.file);
  return scoreDocument(await readFile(path, 'utf8'), path, pack);
}

/** The plain-words scorecard an owner can read ("AI-citation readiness 86,
 *  target 85"). Kept deliberately short: three headline lines, then only the
 *  checks that are not already good. */
export function formatScorecard(r: ScoreFileReport): string {
  const verdict = r.geo.score >= r.target ? 'meets the target' : 'below the target';
  const lines = [
    `${r.slug}${r.draft ? ' (draft)' : ''}`,
    `  Search readiness:       ${r.seo.score}/100 (${r.seo.badCount} weak, ${r.seo.mehCount} so-so)`,
    `  AI-citation readiness:  ${r.geo.score}/100, target ${r.target} (${r.category || 'no category'}) — ${verdict}`,
    `  Reading level:          ${r.grade == null ? 'n/a' : `grade ${r.grade}`}`,
  ];
  const weak = [...r.seo.checks, ...r.geo.checks].filter((c) => c.status !== 'good');
  if (weak.length) {
    lines.push('  Work on:');
    for (const c of weak) lines.push(`    ${c.status === 'bad' ? '✖' : '⚠'} ${c.label}: ${c.value}`);
  } else {
    lines.push('  Every check is good.');
  }
  return lines.join('\n');
}
