import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DomainPack } from '@jeldon/config';
import type { DoctorCheck } from './doctor.js';

/**
 * The doctor check registry (Helix finding #10). `jeldon doctor` knows the
 * Domain Pack; a kit or a project knows what ELSE must be true before launch
 * (SETUP markers left, hours unconfirmed, a lead sink configured…). They
 * register checks by shipping `jeldon.checks.mjs` in the project root:
 *
 *   export default [{ id: 'kit:setup-markers', run: async (ctx) => ({ status: 'warn', message: '…' }) }];
 *
 * `run(ctx)` receives `{ cwd, pack }` and returns one DoctorCheck, an array of
 * them, or a promise of either. A thrown error becomes an `error` check named
 * after the id — a broken check must never hide behind a green doctor.
 */
export interface RegisteredCheck {
  id: string;
  run(ctx: CheckContext): DoctorCheck | DoctorCheck[] | Promise<DoctorCheck | DoctorCheck[]>;
}

export interface CheckContext {
  cwd: string;
  pack: DomainPack;
  /** `--pre` mode: unfinished setup is a warning, not an error. */
  pre: boolean;
}

export const CHECKS_FILES = ['jeldon.checks.mjs', 'jeldon.checks.js'];

export function resolveChecksPath(cwd: string): string | null {
  for (const name of CHECKS_FILES) {
    const p = resolve(cwd, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Load the project's registered checks (empty when the file is absent). */
export async function loadRegisteredChecks(cwd: string): Promise<RegisteredCheck[]> {
  const path = resolveChecksPath(cwd);
  if (!path) return [];
  const mod = (await import(pathToFileURL(path).href)) as { default?: unknown; checks?: unknown };
  const raw = mod.default ?? mod.checks;
  if (!Array.isArray(raw)) {
    throw new Error(`${path} must default-export an array of { id, run } checks.`);
  }
  return raw.map((c, i) => {
    const check = c as Partial<RegisteredCheck>;
    if (!check || typeof check.id !== 'string' || typeof check.run !== 'function') {
      throw new Error(`${path}: check #${i + 1} is missing an id or a run() function.`);
    }
    return check as RegisteredCheck;
  });
}

/** Run every registered check, flattening results and trapping throws. */
export async function runRegisteredChecks(checks: RegisteredCheck[], ctx: CheckContext): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  for (const check of checks) {
    try {
      const res = await check.run(ctx);
      const list = Array.isArray(res) ? res : [res];
      for (const r of list) {
        out.push({ status: r.status, message: `${check.id}: ${r.message}` });
      }
    } catch (err) {
      out.push({ status: 'error', message: `${check.id}: check threw — ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  return out;
}
