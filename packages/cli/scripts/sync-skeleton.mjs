#!/usr/bin/env node
// Copies the consumer skeleton (template/ + kits/) into packages/cli/skeleton
// at build time so the published CLI can spawn a site offline. In the
// monorepo, `jeldon init` falls back to the repo's template/ and kits/ when
// skeleton/ is absent.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const root = resolve(pkg, '../..');
const out = resolve(pkg, 'skeleton');
const template = resolve(root, 'template');
const kits = resolve(root, 'kits');
if (!existsSync(template) || !existsSync(kits)) {
  console.log('sync-skeleton: template/ or kits/ not found (not in the monorepo) — skipping');
  process.exit(0);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(template, resolve(out, 'template'), { recursive: true, filter: (s) => !/node_modules|[\\/]dist$|\.astro$/.test(s) });
cpSync(kits, resolve(out, 'kits'), { recursive: true, filter: (s) => !/node_modules/.test(s) });
console.log(`sync-skeleton: wrote ${out}`);
