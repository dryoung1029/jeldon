#!/usr/bin/env node
/**
 * Vendor the BUILT engine into <dest>/vendor/@jeldon/<name> as npm `file:`
 * packages (workspace:* rewritten to file:../<dep>). Used by the template
 * smoke test and by `jeldon init --vendor-from` runs before the packages are
 * on npm. Usage: node scripts/vendor-engine.mjs <dest-project-dir>
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function vendorEngine(dest, root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const vendor = join(dest, 'vendor', '@jeldon');
  mkdirSync(vendor, { recursive: true });
  for (const name of readdirSync(resolve(root, 'packages'))) {
    const src = resolve(root, 'packages', name);
    const dist = join(src, 'dist');
    if (!existsSync(dist)) throw new Error(`packages/${name}/dist missing — run pnpm build first`);
    const out = join(vendor, name);
    mkdirSync(out, { recursive: true });
    cpSync(dist, join(out, 'dist'), { recursive: true });
    if (existsSync(join(src, 'skeleton'))) cpSync(join(src, 'skeleton'), join(out, 'skeleton'), { recursive: true });
    const p = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
    for (const field of ['dependencies', 'peerDependencies']) {
      for (const [dep, range] of Object.entries(p[field] ?? {})) {
        if (String(range).startsWith('workspace:')) p[field][dep] = `file:../${dep.replace('@jeldon/', '')}`;
      }
    }
    delete p.devDependencies;
    delete p.scripts;
    writeFileSync(join(out, 'package.json'), JSON.stringify(p, null, 2));
  }
  return 'vendor/@jeldon';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const dest = process.argv[2];
  if (!dest) {
    console.error('Usage: node scripts/vendor-engine.mjs <dest-project-dir>');
    process.exit(1);
  }
  console.log(vendorEngine(resolve(dest)));
}
