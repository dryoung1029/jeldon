#!/usr/bin/env node
/**
 * Citation-lint CI gate. Runs `@jeldon/verify`'s `lintCitations` over every
 * article, driven by `pack.citation`. The policy enum decides whether the
 * fabricated-citation guard fires:
 *   - 'search-urls-only'   → forbidden patterns (bare PMIDs/DOIs) are flagged
 *   - 'direct-source-urls' / 'verifier-required' → lint is a no-op (a verifier
 *     supplies the verified IDs; flagging them would fight the verifier)
 *
 * No health literals here — the patterns come from the Domain Pack.
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { loadDomainPack } from '@jeldon/config';
import { lintCitations, formatLintReport } from '@jeldon/verify';
import { parse } from '@jeldon/content-model';

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

  let findings = 0;
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { body } = parse(raw);
    const slug = basename(file, '.md');
    const result = lintCitations(body, pack.citation, file);
    if (!result.ok) {
      findings += result.findings.length;
      for (const f of result.findings) {
        console.error(`::error file=${file},line=${f.line}::${slug}: forbidden citation pattern "${f.pattern}" → ${f.hit}`);
      }
      console.error(formatLintReport ? formatLintReport(result) : `✖ ${slug}: ${result.findings.length} finding(s)`);
    }
  }

  if (findings) {
    console.error(`\n✖ citation-lint: ${findings} finding(s) under policy "${pack.citation.policy}".`);
    process.exit(1);
  }
  console.log(`✔ citation-lint: clean under policy "${pack.citation.policy}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
