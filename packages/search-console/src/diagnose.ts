/**
 * Map a Search Console setup failure to a named fix.
 *
 * Body of Health hit four failures on 2026-07-09 that each looked like "still
 * broken" (BoH CLAUDE.md, fetch-search-console.yml notes):
 *   1. secret saved under a misspelled name — GitHub expands an unset secret to
 *      "", so the job sees an empty key (the log prints blank, not `***`);
 *   2. Search Console API not enabled on the GCP project — 403
 *      `accessNotConfigured` / `SERVICE_DISABLED`;
 *   3. service account not added as a user on the property — generic 403;
 *   4. property-id mismatch (`http://` vs `https://` vs `sc-domain:`) — the
 *      SAME 403 as (3). The error body echoes the site string it tried (even
 *      masked, `'http://***'` shows the scheme), which is the fastest tell.
 * (3) and (4) cannot be separated from one 403 alone; pass the
 * `accessibleSites` the service account can see (`listSites`) and they can.
 * Anything else is `unattestable` with the raw message — never guessed.
 */
import { checkPropertyFormat, propertyHost } from './property.js';

export type SearchConsoleDiagnosisKind =
  | 'secret_empty'
  | 'api_not_enabled'
  | 'sa_not_user'
  | 'property_mismatch'
  | 'key_rejected'
  | 'unattestable';

export interface SearchConsoleDiagnosis {
  kind: SearchConsoleDiagnosisKind;
  /** One line: what is wrong. */
  summary: string;
  /** What to do about it. */
  fix: string;
  /** A console link that applies the fix, when one is known. */
  link?: string;
  /** For `sa_not_user` without `accessibleSites`: the look-alike that has not
   *  been ruled out, and how to rule it out. */
  alsoPossible?: { kind: SearchConsoleDiagnosisKind; howToTell: string };
  /** For `property_mismatch`: the property string that would work, when known. */
  suggestedProperty?: string;
  /** The raw error, always kept. */
  raw: string;
}

export interface DiagnoseContext {
  /** Which call failed. `config` = nothing was sent (secret missing/empty). */
  stage?: 'config' | 'token' | 'query';
  /** The property string that was used. */
  property?: string;
  /** Env var names, so the fix can name them. */
  saKeyEnv?: string;
  propertyEnv?: string;
  /** Which secret read as empty/unset, for stage `config`. */
  emptySecret?: string;
  /** Env var names present in the environment that look like a misspelling
   *  of the expected one (see `nearMissEnvNames`). */
  nearMissEnv?: string[];
  /** Service-account email, so the fix can name it. */
  clientEmail?: string;
  /** Sites the service account can see (`GET /sites`). Separates (3) from (4). */
  accessibleSites?: string[];
}

interface GoogleErrorShape {
  error?:
    | string
    | {
        code?: number;
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string; message?: string }>;
        details?: Array<{ reason?: string; metadata?: Record<string, string>; links?: Array<{ url?: string }> }>;
      };
  error_description?: string;
}

function parseBody(body: string): GoogleErrorShape | null {
  try {
    const j = JSON.parse(body) as unknown;
    return j && typeof j === 'object' ? (j as GoogleErrorShape) : null;
  } catch {
    return null;
  }
}

const ENABLE_API_BASE = 'https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview';

function enableLink(body: string, parsed: GoogleErrorShape | null): string {
  const e = parsed && typeof parsed.error === 'object' ? parsed.error : undefined;
  for (const d of e?.details ?? []) {
    const url = d.metadata?.activationUrl ?? d.links?.find((l) => l.url)?.url;
    if (url && url.startsWith('https://')) return url;
  }
  const m = body.match(/project[s]?[/ ]+(\d{3,})/i);
  return m ? `${ENABLE_API_BASE}?project=${m[1]}` : ENABLE_API_BASE;
}

/** The site string Google echoes in its permission error: `for site 'X'`. */
function echoedSite(message: string): string | undefined {
  const m = message.match(/site\s+'([^']+)'/i) ?? message.match(/site\s+"([^"]+)"/i);
  return m?.[1];
}

function sameSite(siteHost: string, host: string): boolean {
  return siteHost === host || siteHost.endsWith(`.${host}`) || host.endsWith(`.${siteHost}`);
}

export function diagnoseSearchConsoleError(
  status: number,
  body: string,
  ctx: DiagnoseContext = {},
): SearchConsoleDiagnosis {
  const raw = `${status ? `${status} ` : ''}${body}`.trim();
  const keyEnv = ctx.saKeyEnv ?? 'the service-account key secret';
  const propEnv = ctx.propertyEnv ?? 'the property secret';

  // (1) Nothing was sent: a secret read as empty.
  if (ctx.stage === 'config' || ctx.emptySecret) {
    const name = ctx.emptySecret ?? keyEnv;
    const near = ctx.nearMissEnv?.length ? ` Found similarly named: ${ctx.nearMissEnv.join(', ')} — rename it to ${name}.` : '';
    return {
      kind: 'secret_empty',
      summary: `${name} is unset or empty`,
      fix:
        `Check the secret is saved under exactly ${name}. GitHub Actions expands a misspelled secret reference to an empty string, ` +
        `so the job's env log shows a blank instead of \`***\`.${near}`,
      raw: raw || `${name} empty`,
    };
  }

  const parsed = parseBody(body);
  const errObj = parsed && typeof parsed.error === 'object' ? parsed.error : undefined;
  const message = errObj?.message ?? (typeof parsed?.error === 'string' ? `${parsed.error}: ${parsed.error_description ?? ''}` : body);
  const reasons = [
    ...(errObj?.errors ?? []).map((e) => e.reason ?? ''),
    ...(errObj?.details ?? []).map((d) => d.reason ?? ''),
    errObj?.status ?? '',
  ].filter(Boolean);
  const hay = `${reasons.join(' ')} ${body}`;

  // Token exchange rejected the key itself (revoked/deleted key, wrong account).
  if (ctx.stage === 'token' && (status === 400 || status === 401) && /invalid_grant|invalid_client|unauthorized_client/i.test(hay)) {
    return {
      kind: 'key_rejected',
      summary: 'Google rejected the service-account key at token exchange',
      fix: `The key in ${keyEnv} is revoked, deleted, or belongs to a deleted service account. Create a new JSON key for the service account and replace the secret.`,
      raw,
    };
  }

  // (2) API not enabled on the GCP project.
  if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used in project|is disabled/i.test(hay)) {
    const link = enableLink(body, parsed);
    return {
      kind: 'api_not_enabled',
      summary: 'Search Console API is not enabled on the service account\'s GCP project',
      fix: 'Enable the Google Search Console API for the project that owns the service account, wait ~2 minutes for it to propagate, and retry.',
      link,
      raw,
    };
  }

  // (3) / (4): the identical permission 403.
  if (status === 403 && /forbidden|PERMISSION_DENIED|insufficient permission|sufficient permission/i.test(hay)) {
    const used = ctx.property;
    const echoed = echoedSite(message);
    const site = echoed ?? used;
    const who = ctx.clientEmail ? ` (${ctx.clientEmail})` : '';
    const addUser = {
      kind: 'sa_not_user' as const,
      summary: 'service account is not a user on this Search Console property',
      fix: `In Search Console → Settings → Users and permissions, add the service account${who} (Restricted is enough) to the exact property in ${propEnv}.`,
      raw,
    };

    // Decisive path: we know what the service account can see.
    if (ctx.accessibleSites) {
      if (used && ctx.accessibleSites.includes(used)) {
        return {
          kind: 'unattestable',
          summary: 'permission 403 on a property the service account can list',
          fix: 'The service account is a user on this exact property, so neither (3) nor (4) applies. Check its permission level and retry; if it persists, read the raw error.',
          raw,
        };
      }
      const host = used ? propertyHost(used) : null;
      const alt = host
        ? ctx.accessibleSites.find((s) => {
            const h = propertyHost(s);
            return h != null && sameSite(h, host);
          })
        : undefined;
      if (alt) {
        return {
          kind: 'property_mismatch',
          summary: `the service account can see "${alt}", not "${used}"`,
          fix: `Set ${propEnv} to "${alt}" exactly. Search Console treats sc-domain:, http:// and https:// as different properties.`,
          suggestedProperty: alt,
          raw,
        };
      }
      return {
        ...addUser,
        summary: ctx.accessibleSites.length
          ? 'service account is not a user on this property (it can see other properties, none for this site)'
          : 'service account is not a user on any Search Console property',
      };
    }

    // Without the site list: use the format and the echoed scheme.
    if (site) {
      // A body copied from a CI log has the secret masked (`'http://***'`):
      // the scheme still shows, the rest cannot be format-checked.
      const masked = site.includes('***');
      const fmt = masked ? ({ ok: true } as const) : checkPropertyFormat(site);
      const schemeEchoed = echoed?.match(/^(https?):\/\//i)?.[1]?.toLowerCase();
      const schemeUsed = used?.match(/^(https?):\/\//i)?.[1]?.toLowerCase();
      if (!fmt.ok) {
        return {
          kind: 'property_mismatch',
          summary: `"${site}" is not a valid property id: ${fmt.error}`,
          fix: `Set ${propEnv} to the property exactly as Search Console shows it: sc-domain:<host> for a domain property, or https://<host>/ with the trailing slash for a URL-prefix property.`,
          ...(fmt.suggestion ? { suggestedProperty: fmt.suggestion } : {}),
          raw,
        };
      }
      if ((schemeEchoed && schemeUsed && schemeEchoed !== schemeUsed) || schemeEchoed === 'http' || (!echoed && schemeUsed === 'http')) {
        return {
          kind: 'property_mismatch',
          summary: `the request went to an http:// property ("${site}")`,
          fix: `http:// and https:// are different properties. If the site is served over HTTPS, set ${propEnv} to the https:// form (or the sc-domain: form if that is the property you verified).`,
          raw,
        };
      }
    }
    return {
      ...addUser,
      alsoPossible: {
        kind: 'property_mismatch',
        howToTell:
          `This 403 is identical for a property-string mismatch. Open the Search Console property picker and compare the exact string with ${propEnv}: ` +
          'a domain property is sc-domain:<host>, a URL-prefix property is https://<host>/. If the service account is already listed under Users and permissions, it is the mismatch. ' +
          '`jeldon doctor --online` lists the properties the service account can see, which settles it.',
      },
    };
  }

  return {
    kind: 'unattestable',
    summary: 'unrecognised Search Console error',
    fix: 'Not one of the known setup failures; read the raw error.',
    raw: raw || 'no error body',
  };
}

/**
 * Env var names that look like a misspelling of `expected` (edit distance
 * <= 2, case-insensitive), with a non-empty value. Catches
 * `GOOGLE_SEACH_CONSOLE_SA_KEY` when `GOOGLE_SEARCH_CONSOLE_SA_KEY` is empty.
 */
export function nearMissEnvNames(expected: string, env: Record<string, string | undefined>): string[] {
  const want = expected.toUpperCase();
  return Object.keys(env).filter((k) => {
    if (k === expected || !env[k]) return false;
    const have = k.toUpperCase();
    if (Math.abs(have.length - want.length) > 2) return false;
    return editDistance(have, want) <= 2;
  });
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] as number;
      prev[j] = Math.min((prev[j] as number) + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length] as number;
}
