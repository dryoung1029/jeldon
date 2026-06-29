#!/usr/bin/env node
/**
 * GEO-floor CI gate. Scores every changed (or all, if none passed) article with
 * the SAME `@jeldon/core-scoring` the editor dial uses — no mirrored scoring
 * logic — and fails if any scores below its category target (or the GEO floor as
 * a backstop).
 *
 * Usage:
 *   node scripts/check-geo-floor.mjs [file ...]
 * With no args, scores every non-draft article under src/content/articles.
 *
 * This is a thin host step: when `jeldon check-geo-floor` ships in @jeldon/cli,
 * the workflow can swap to it with no behavior change (same scorer underneath).
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { loadDomainPack } from '@jeldon/config';
import { calculateGeo } from '@jeldon/core-scoring';
import { parse, isLive } from '@jeldon/content-model';

const ARTICLES_DIR = resolve('src/content/articles');

async function targetsFor(pack) {
  return { targets: pack.content.categoryTargets, floor: pack.scoring.geo.floor };
}

async function listArticleFiles(args) {
  const explicit = args.filter((a) => a.endsWith('.md'));
  if (explicit.length) return explicit.map((f) => resolve(f));
  const files = await readdir(ARTICLES_DIR);
  return files.filter((f) => f.endsWith('.md')).map((f) => resolve(ARTICLES_DIR, f));
}

async function main() {
  const pack = await loadDomainPack();
  const { targets, floor } = await targetsFor(pack);
  const files = await listArticleFiles(process.argv.slice(2));

  let failed = 0;
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { frontmatter, body } = parse(raw);

    // Only score articles that ship publicly. Drafts are work-in-progress.
    if (!isLive(frontmatter)) continue;

    const slug = basename(file, '.md');
    const input = {
      title: String(frontmatter.title ?? ''),
      excerpt: String(frontmatter.excerpt ?? ''),
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      body,
      slug,
      heroImage: frontmatter.heroImage,
      heroImageAlt: frontmatter.heroImageAlt,
    };

    const { score } = calculateGeo(input, pack.scoring.geo);
    const category = String(frontmatter.category ?? '');
    const target = targets[category] ?? floor;

    if (score < target) {
      failed++;
      const msg = `GEO ${score} < target ${target} (category: ${category})`;
      console.error(`::error file=${file}::${slug}: ${msg}`);
      console.error(`✖ ${slug}: ${msg}`);
    } else {
      console.log(`✔ ${slug}: GEO ${score} >= ${target} (${category})`);
    }
  }

  if (failed) {
    console.error(`\n✖ geo-floor: ${failed} article(s) below target.`);
    process.exit(1);
  }
  console.log('\n✔ geo-floor: all scored articles meet their category target.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
