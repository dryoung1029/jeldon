import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { domainPackSchema } from './schema.js';
import type { DomainPack } from './types.js';

export interface ValidateResult {
  ok: boolean;
  data?: DomainPack;
  errors: Array<{ path: string; message: string }>;
}

/** Validate a plain object against the Domain Pack schema. Pure — no I/O. */
export function validateDomainPack(input: unknown): ValidateResult {
  const parsed = domainPackSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data as DomainPack, errors: [] };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  };
}

const CONFIG_CANDIDATES = ['jeldon.config.ts', 'jeldon.config.mjs', 'jeldon.config.js'];

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

/** Identity helper for type-safe config authoring in `jeldon.config.ts`. */
export function defineDomainPack(pack: DomainPack): DomainPack {
  return pack;
}
