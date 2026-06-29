#!/usr/bin/env node
/**
 * Frontmatter-guard CI gate. Validates every article's frontmatter against the
 * pack-derived Zod schema via `@jeldon/content-model`'s `validateArticle`. This
 * is the gate that catches an out-of-enum `category`, a malformed date, or a
 * numeric field that got stringly-quoted by an out-of-band writer (the
 * `audioBodyLength: "10772"` class of bug that killed whole content builds).
 *
 * The category enum is derived from `jeldon.config.ts` — one list, no mirror.
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { loadDomainPack } from '@jeldon/config';
import { validateArticle } from '@jeldon/content-model';

const ARTICLES_DIR = resolve('src/content/articles');

async function listArticleFiles(args) {
  const explicit = args.filter((a) => a.endsWith('.md'));
  if (explicit.length) return explicit.map((f) => resolve(f));
  const files = await readdir(ARTICLES_DIR);
  return files.filter((f) => f.endsWith('.md')).map((f) => resolve(ARTICLES_DIR, f));
}

async function main() {
  const pack = await loadDomainPack();
  const files = await listArticleFiles(process.argv.slice(2));

  let failed = 0;
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const slug = basename(file, '.md');
    const result = validateArticle(raw, pack);
    if (!result.ok) {
      failed++;
      for (const e of result.errors) {
        console.error(`::error file=${file}::${slug}: ${e.path}: ${e.message}`);
      }
      console.error(`✖ ${slug}: ${result.errors.length} frontmatter error(s)`);
    } else {
      console.log(`✔ ${slug}: frontmatter valid`);
    }
  }

  if (failed) {
    console.error(`\n✖ frontmatter-guard: ${failed} article(s) failed validation.`);
    process.exit(1);
  }
  console.log('\n✔ frontmatter-guard: all articles valid against the pack-derived schema.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
