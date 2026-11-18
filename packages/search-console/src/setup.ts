/**
 * Setup checks behind `jeldon doctor`. Offline checks need no network; the
 * online probe does one token exchange and a 1-row query, and runs
 * `diagnoseSearchConsoleError` on failure. Both return plain check records so
 * the CLI keeps its own output format.
 */
import type { SearchConsoleConfig } from '@jeldon/config';
import { getAccessToken, parseServiceAccountKey, SearchConsoleHttpError, type FetchLike, type ServiceAccountKey } from './auth.js';
import { fetchSearchAnalytics, listSites, searchDateRange } from './client.js';
import { diagnoseSearchConsoleError, nearMissEnvNames, type SearchConsoleDiagnosis } from './diagnose.js';
import { checkPropertyFormat } from './property.js';

export type SetupCheckStatus = 'ok' | 'warn' | 'error';
export interface SetupCheck {
  status: SetupCheckStatus;
  message: string;
}

type Env = Record<string, string | undefined>;

export interface ResolvedSetup {
  property?: string;
  key?: ServiceAccountKey;
}

/**
 * Offline: env names exist and are non-empty, the key parses and has
 * client_email/private_key, the property format is valid. `missingAs` sets
 * the severity of an unset secret (doctor `--pre` downgrades to warn).
 */
export function checkSearchConsoleSetup(
  cfg: SearchConsoleConfig,
  env: Env,
  opts: { missingAs?: SetupCheckStatus } = {},
): { checks: SetupCheck[]; resolved: ResolvedSetup } {
  const missingAs = opts.missingAs ?? 'error';
  const checks: SetupCheck[] = [];
  const add = (status: SetupCheckStatus, message: string) => checks.push({ status, message });
  const resolved: ResolvedSetup = {};

  const envState = (name: string): 'set' | 'empty' | 'unset' =>
    env[name] === undefined ? 'unset' : env[name]!.trim() === '' ? 'empty' : 'set';
  const nearHint = (name: string) => {
    const near = nearMissEnvNames(name, env);
    return near.length ? ` — found similarly named ${near.join(', ')}; is the secret misspelled?` : '';
  };

  // Key.
  const keyState = envState(cfg.saKeyEnv);
  if (keyState === 'unset') {
    add(missingAs, `searchConsole: env ${cfg.saKeyEnv} missing${nearHint(cfg.saKeyEnv)}`);
  } else if (keyState === 'empty') {
    // The look-alike: GitHub expands a misspelled secret reference to "".
    add('error', `searchConsole: env ${cfg.saKeyEnv} is set but empty (a misspelled GitHub secret name expands to "")${nearHint(cfg.saKeyEnv)}`);
  } else {
    const parsed = parseServiceAccountKey(env[cfg.saKeyEnv]);
    if (parsed.ok) {
      resolved.key = parsed.key;
      add('ok', `searchConsole: ${cfg.saKeyEnv} parses (${parsed.encoding}) with client_email ${parsed.key.client_email}`);
    } else {
      add('error', `searchConsole: ${cfg.saKeyEnv} — ${parsed.message}`);
    }
  }

  // Property.
  let property: string | undefined;
  let source: string;
  if (cfg.property !== undefined) {
    property = cfg.property;
    source = 'searchConsole.property';
  } else {
    source = `env ${cfg.propertyEnv}`;
    const ps = envState(cfg.propertyEnv);
    if (ps === 'unset') add(missingAs, `searchConsole: env ${cfg.propertyEnv} missing${nearHint(cfg.propertyEnv)}`);
    else if (ps === 'empty') add('error', `searchConsole: env ${cfg.propertyEnv} is set but empty (a misspelled GitHub secret name expands to "")${nearHint(cfg.propertyEnv)}`);
    else property = env[cfg.propertyEnv];
  }
  if (property !== undefined) {
    const fmt = checkPropertyFormat(property);
    if (!fmt.ok) {
      add('error', `searchConsole: ${source} — ${fmt.error}${fmt.suggestion ? ` (did you mean ${fmt.suggestion}?)` : ''}`);
    } else {
      resolved.property = property;
      if (fmt.warning) add('warn', `searchConsole: ${source} — ${fmt.warning}`);
      else add('ok', `searchConsole: ${source} is a valid ${fmt.kind} property`);
    }
  }

  if (cfg.strikingDistance.minPosition > cfg.strikingDistance.maxPosition) {
    add('error', 'searchConsole.strikingDistance: minPosition is greater than maxPosition');
  }
  return { checks, resolved };
}

export type OnlineProbeResult =
  | { status: 'ok'; rows: number; clientEmail: string; property: string }
  | { status: 'failed'; diagnosis: SearchConsoleDiagnosis }
  | { status: 'skipped'; reason: string };

/**
 * Online: token exchange + a 1-row query over the configured window. On a
 * permission 403 it also lists the sites the service account can see, which
 * separates "not a user" from "wrong property string".
 */
export async function probeSearchConsole(
  cfg: SearchConsoleConfig,
  resolved: ResolvedSetup,
  opts: { fetch?: FetchLike; now?: Date } = {},
): Promise<OnlineProbeResult> {
  if (!resolved.key || !resolved.property) {
    return { status: 'skipped', reason: 'offline checks failed — fix those first' };
  }
  const ctx = {
    property: resolved.property,
    saKeyEnv: cfg.saKeyEnv,
    propertyEnv: cfg.property !== undefined ? 'searchConsole.property' : cfg.propertyEnv,
    clientEmail: resolved.key.client_email,
  };
  let token: string;
  try {
    token = await getAccessToken(resolved.key, { fetch: opts.fetch, now: opts.now?.getTime() });
  } catch (err) {
    if (err instanceof SearchConsoleHttpError) {
      return { status: 'failed', diagnosis: diagnoseSearchConsoleError(err.status, err.body, { ...ctx, stage: 'token' }) };
    }
    return { status: 'failed', diagnosis: diagnoseSearchConsoleError(0, (err as Error).message, { ...ctx, stage: 'token' }) };
  }
  const client = { accessToken: token, fetch: opts.fetch };
  try {
    const rows = await fetchSearchAnalytics(client, resolved.property, searchDateRange({ ...cfg, now: opts.now }), [], { rowLimit: 1 });
    return { status: 'ok', rows: rows.length, clientEmail: resolved.key.client_email, property: resolved.property };
  } catch (err) {
    if (!(err instanceof SearchConsoleHttpError)) {
      return { status: 'failed', diagnosis: diagnoseSearchConsoleError(0, (err as Error).message, { ...ctx, stage: 'query' }) };
    }
    let accessibleSites: string[] | undefined;
    if (err.status === 403) {
      try {
        accessibleSites = (await listSites(client)).map((s) => s.siteUrl);
      } catch {
        accessibleSites = undefined; // cannot list → fall back to body/format heuristics
      }
    }
    return {
      status: 'failed',
      diagnosis: diagnoseSearchConsoleError(err.status, err.body, { ...ctx, stage: 'query', accessibleSites }),
    };
  }
}
