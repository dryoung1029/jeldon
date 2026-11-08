#!/usr/bin/env node
// Generate schemas/domain-pack.schema.json from the Zod schema in
// @jeldon/config so editors get autocomplete + structural validation on
// jeldon.config.json-style files. Requires `@jeldon/config` to be built first
// (pnpm build), since it imports the compiled schema.
//
// Uses zod v4's built-in `z.toJSONSchema()` rather than the third-party
// `zod-to-json-schema` package, whose zod-v4 support was unconfirmed at the
// time of the zod 3->4 migration. Output target is the default
// draft-2020-12; reused sub-schemas are inlined (not `$defs`-refed) to keep
// the file a single flat, human-readable document.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

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
  const json = z.toJSONSchema(domainPackSchema, { reused: 'inline' });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
  console.log(`Wrote ${out}`);
}

main();
