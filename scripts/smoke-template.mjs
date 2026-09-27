#!/usr/bin/env node
/**
 * Template smoke test — proves a consumer clone works end to end BEFORE the
 * packages are on npm (and, after, that the template still does).
 *
 *   node scripts/smoke-template.mjs [--kit local-business] [--keep] [--dir <path>]
 *
 * Steps (each is a real consumer step, in the order a fresh clone runs them):
 *   1. copy template/ (plus the kit overlay when --kit) into a temp dir
 *   2. vendor every built @jeldon/* package as file: deps (the exact shape
 *      Helix used; workspace:* is rewritten to file:../<dep>) — with published
 *      packages the template's ^0.1.0 ranges are used untouched (--npm)
 *   3. npm install  (npm, not pnpm — the bin-less install is the trap we test)
 *   4. npm run check:engine · validate · doctor · check:frontmatter ·
 *      check:citations · check:geo · check (astro check) · build ·
 *      INCLUDE_DRAFTS=true build · wrangler deploy --dry-run
 *
 * Requires `pnpm build` first and network access to the npm registry (astro,
 * wrangler). Exit 0 = the template is spawnable.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const dir = opt('--dir') ? resolve(opt('--dir')) : mkdtempSync(join(tmpdir(), 'jeldon-template-'));
const kit = opt('--kit');
const useNpm = flag('--npm');

function run(cmd, cwd = dir, env = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
}

console.log(`→ ${dir}`);
if (existsSync(dir) && readdirSync(dir).length) rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
cpSync(resolve(root, 'template'), dir, { recursive: true });
if (kit) {
  const kitDir = resolve(root, 'kits', kit);
  if (!existsSync(kitDir)) throw new Error(`No kit at ${kitDir}`);
  // Overlay the kit. `agent/` holds templates jeldon init renders (not copied
  // raw); kit.package.json is merged into package.json; DESIGN.md → docs/.
  cpSync(kitDir, dir, {
    recursive: true,
    force: true,
    filter: (src) => !/[\/\\](agent|kit\.package\.json|DESIGN\.md)$/.test(src) && !/[\/\\]agent[\/\\]/.test(src),
  });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  cpSync(join(kitDir, 'DESIGN.md'), join(dir, 'docs', 'DESIGN.md'));
  const kitPkg = JSON.parse(readFileSync(join(kitDir, 'kit.package.json'), 'utf8'));
  const base = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  base.scripts = { ...base.scripts, ...kitPkg.scripts };
  base.dependencies = { ...base.dependencies, ...kitPkg.dependencies };
  base.devDependencies = { ...base.devDependencies, ...(kitPkg.devDependencies ?? {}) };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(base, null, 2) + '\n');
  // The template's article pages are superseded by the kit's; nothing else collides.
}

// Vendor the built engine as file: deps.
const pkgPath = join(dir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (!useNpm) {
  const vendor = join(dir, 'vendor', '@jeldon');
  mkdirSync(vendor, { recursive: true });
  const names = readdirSync(resolve(root, 'packages'));
  for (const name of names) {
    const src = resolve(root, 'packages', name);
    const dist = join(src, 'dist');
    if (!existsSync(dist)) throw new Error(`packages/${name}/dist missing — run pnpm build first`);
    const dest = join(vendor, name);
    mkdirSync(dest, { recursive: true });
    cpSync(dist, join(dest, 'dist'), { recursive: true });
    const p = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
    for (const field of ['dependencies', 'peerDependencies']) {
      for (const [dep, range] of Object.entries(p[field] ?? {})) {
        if (String(range).startsWith('workspace:')) p[field][dep] = `file:../${dep.replace('@jeldon/', '')}`;
      }
    }
    delete p.devDependencies;
    delete p.scripts;
    writeFileSync(join(dest, 'package.json'), JSON.stringify(p, null, 2));
  }
  for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
    if (dep.startsWith('@jeldon/')) pkg.dependencies[dep] = `file:vendor/@jeldon/${dep.replace('@jeldon/', '')}`;
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

run('npm install --no-audit --no-fund --loglevel=error');
run('npm run check:engine');
run('npm run validate');
run('npm run doctor -- --pre');
run('npm run check:frontmatter');
run('npm run check:citations');
run('npm run check:geo');
run('npm run check');
run('npm run build');
run('npm run build', dir, { INCLUDE_DRAFTS: 'true' });
run('npm run deploy:cf -- --dry-run');

const distFiles = readdirSync(join(dir, 'dist'));
console.log(`\n✔ template smoke test passed (${distFiles.length} top-level dist entries) — ${dir}`);
if (!flag('--keep') && !opt('--dir')) rmSync(dir, { recursive: true, force: true });
