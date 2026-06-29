#!/usr/bin/env node
// Generate schemas/domain-pack.schema.json from the Zod schema in
// @jeldon/config so editors get autocomplete + structural validation on
// jeldon.config.json-style files. Requires `@jeldon/config` to be built first
// (pnpm build), since it imports the compiled schema.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'schemas/domain-pack.schema.json');

async function main() {
  let domainPackSchema;
  try {
    ({ domainPackSchema } = await import('@jeldon/config'));
  } catch (err) {
    console.error('Could not import @jeldon/config. Run `pnpm build` first.');
    console.error(err);
    process.exit(1);
  }
  const { zodToJsonSchema } = await import('zod-to-json-schema');
  const json = zodToJsonSchema(domainPackSchema, {
    name: 'DomainPack',
    $refStrategy: 'none',
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
  console.log(`Wrote ${out}`);
}

main();
