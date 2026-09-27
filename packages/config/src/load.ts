/**
 * `@jeldon/config/load` — the Node-only loader entry point.
 *
 * Everything here touches the filesystem (`node:fs`, `node:path`, `node:url`)
 * and jiti. It is a SEPARATE entry so that importing `@jeldon/config` (types,
 * schema, defaults, pure helpers) from a Cloudflare Worker route never drags
 * jiti + `node:fs` into the bundle (Helix finding #8). Build-time code —
 * `astro.config.mjs`, `src/lib/pack.ts`, the CLI, CI scripts — imports from
 * here; runtime routes import from the root.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { validateDomainPack } from './validate.js';
import type { DomainPack } from './types.js';

export { validateDomainPack, defineDomainPack, type ValidateResult } from './validate.js';

export const CONFIG_CANDIDATES = ['jeldon.config.ts', 'jeldon.config.mjs', 'jeldon.config.js'];

export function resolveConfigPath(cwd = process.cwd(), explicit?: string): string | null {
  if (explicit) {
    const p = resolve(cwd, explicit);
    return existsSync(p) ? p : null;
  }
  for (const name of CONFIG_CANDIDATES) {
    const p = resolve(cwd, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Load + validate the project's Domain Pack. Imports `jeldon.config.ts` via
 * jiti (no build step required), reads its default export, and validates.
 * Throws with a readable message on any failure.
 */
export async function loadDomainPack(opts: { cwd?: string; path?: string } = {}): Promise<DomainPack> {
  const cwd = opts.cwd ?? process.cwd();
  const configPath = resolveConfigPath(cwd, opts.path);
  if (!configPath) {
    throw new Error(
      `No Jeldon config found. Expected one of ${CONFIG_CANDIDATES.join(', ')} in ${cwd}.`,
    );
  }
  const jiti = createJiti(pathToFileURL(cwd + '/').href);
  const mod = (await jiti.import(configPath)) as { default?: unknown };
  const raw = mod?.default ?? mod;
  const result = validateDomainPack(raw);
  if (!result.ok || !result.data) {
    const lines = result.errors.map((e) => `  • ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Invalid Domain Pack at ${configPath}:\n${lines}`);
  }
  return result.data;
}
