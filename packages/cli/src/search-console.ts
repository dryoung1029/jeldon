import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { DomainPack } from '@jeldon/config';
import {
  checkSearchConsoleSetup,
  diagnoseSearchConsoleError,
  fetchSnapshot,
  getAccessToken,
  nearMissEnvNames,
  parseServiceAccountKey,
  probeSearchConsole,
  SearchConsoleHttpError,
  serializeSnapshot,
  snapshotChanged,
  type FetchLike,
  type SearchConsoleDiagnosis,
} from '@jeldon/search-console';
import type { CheckStatus, DoctorCheck } from './doctor.js';

type Env = Record<string, string | undefined>;

export function formatDiagnosis(d: SearchConsoleDiagnosis): string {
  const parts = [`[${d.kind}] ${d.summary} — ${d.fix}`];
  if (d.link) parts.push(`Link: ${d.link}`);
  if (d.suggestedProperty) parts.push(`Use: ${d.suggestedProperty}`);
  if (d.alsoPossible) parts.push(`Also possible [${d.alsoPossible.kind}]: ${d.alsoPossible.howToTell}`);
  if (d.kind === 'unattestable') parts.push(`Raw: ${d.raw}`);
  return parts.join(' ');
}

/**
 * Search Console doctor checks. Offline always (when configured); the online
 * probe (token exchange + 1-row query) only with `online: true`.
 */
export async function searchConsoleChecks(
  pack: DomainPack,
  opts: { env: Env; pre?: boolean; online?: boolean; fetch?: FetchLike },
): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  const add = (status: CheckStatus, message: string, diagnosis?: SearchConsoleDiagnosis) =>
    out.push(diagnosis ? { status, message, diagnosis } : { status, message });
  const cfg = pack.searchConsole;
  if (!cfg) {
    if (pack.capabilities.searchConsole) add('warn', 'capabilities.searchConsole is on but no searchConsole section is configured');
    if (opts.online) add('warn', '--online: searchConsole is not configured; nothing to probe');
    return out;
  }
  const { checks, resolved } = checkSearchConsoleSetup(cfg, opts.env, { missingAs: opts.pre ? 'warn' : 'error' });
  out.push(...checks);
  if (!opts.online) return out;

  const probe = await probeSearchConsole(cfg, resolved, { fetch: opts.fetch });
  if (probe.status === 'ok') {
    add('ok', `searchConsole --online: token exchange + query succeeded for ${probe.property} as ${probe.clientEmail} (${probe.rows} row)`);
  } else if (probe.status === 'skipped') {
    add('warn', `searchConsole --online: skipped — ${probe.reason}`);
  } else {
    add('error', `searchConsole --online: ${formatDiagnosis(probe.diagnosis)}`, probe.diagnosis);
  }
  return out;
}

/**
 * The cron step: fetch the snapshot and write it when the numbers changed.
 * Missing secrets skip with a `::warning::` (exit 0) so the job is safe to
 * enable before creds land but never reads as a silent green.
 */
export async function runFetchSearchConsole(
  pack: DomainPack,
  opts: { env: Env; cwd?: string; fetch?: FetchLike; log?: (s: string) => void },
): Promise<{ exitCode: number }> {
  const log = opts.log ?? console.log;
  const cfg = pack.searchConsole;
  if (!cfg) {
    log('::warning::fetch-search-console skipped — no searchConsole section in jeldon.config.ts; the snapshot is NOT being refreshed.');
    return { exitCode: 0 };
  }
  const property = cfg.property ?? opts.env[cfg.propertyEnv]?.trim();
  const keyRaw = opts.env[cfg.saKeyEnv];
  if (!keyRaw?.trim() || !property) {
    const empty = !keyRaw?.trim() ? cfg.saKeyEnv : cfg.propertyEnv;
    const d = diagnoseSearchConsoleError(0, '', {
      stage: 'config',
      emptySecret: empty,
      nearMissEnv: nearMissEnvNames(empty, opts.env),
    });
    log(`::warning::fetch-search-console skipped — ${cfg.saKeyEnv} / ${cfg.propertyEnv} not configured; ${cfg.snapshotPath} is NOT being refreshed. ${d.fix}`);
    return { exitCode: 0 };
  }
  const key = parseServiceAccountKey(keyRaw);
  if (!key.ok) {
    log(`::error::fetch-search-console: ${cfg.saKeyEnv} — ${key.message}`);
    return { exitCode: 1 };
  }
  const ctx = { property, saKeyEnv: cfg.saKeyEnv, propertyEnv: cfg.propertyEnv, clientEmail: key.key.client_email };
  let snapshotText: string;
  try {
    const accessToken = await getAccessToken(key.key, { fetch: opts.fetch });
    const snap = await fetchSnapshot({ accessToken, fetch: opts.fetch }, property, cfg);
    snapshotText = serializeSnapshot(snap);
  } catch (err) {
    const d =
      err instanceof SearchConsoleHttpError
        ? diagnoseSearchConsoleError(err.status, err.body, { ...ctx, stage: err.stage })
        : diagnoseSearchConsoleError(0, (err as Error).message, ctx);
    log(`::error::fetch-search-console: ${formatDiagnosis(d)}`);
    return { exitCode: 1 };
  }
  const path = resolve(opts.cwd ?? process.cwd(), cfg.snapshotPath);
  const prev = await readFile(path, 'utf8').catch(() => null);
  if (!snapshotChanged(prev, snapshotText)) {
    log('[fetch-search-console] No change; nothing to write.');
    return { exitCode: 0 };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, snapshotText, 'utf8');
  log(`[fetch-search-console] Wrote ${cfg.snapshotPath}.`);
  return { exitCode: 0 };
}
