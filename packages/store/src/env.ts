/**
 * GitHub credential resolution. Ported from BoH `github.ts::readEnv` — reads
 * from Cloudflare `locals.runtime.env` when present, else `process.env`. Keeps
 * the repo coordinates (token/owner/repo/branch) in the environment exactly as
 * the source system does; the engine never bakes them in.
 */

import type { GitHubEnv } from './types.js';

interface EnvBag {
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  [k: string]: string | undefined;
}

/** Pull the env bag out of a Cloudflare `locals` (or fall back to process.env). */
export function resolveEnvBag(locals?: { runtime?: { env?: EnvBag } }): EnvBag {
  return (
    locals?.runtime?.env ??
    (typeof process !== 'undefined' ? (process.env as EnvBag) : {})
  );
}

/**
 * Read + validate GitHub coordinates. Throws the same readable error the source
 * system throws when any of the four are missing.
 */
export function readGitHubEnv(locals?: { runtime?: { env?: EnvBag } }): GitHubEnv {
  const env = resolveEnvBag(locals);
  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH;
  if (!token || !owner || !repo || !branch) {
    throw new Error(
      'Missing GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH env vars',
    );
  }
  return { token, owner, repo, branch };
}
