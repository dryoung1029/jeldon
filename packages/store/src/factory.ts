/**
 * Store factory — picks the adapter from `pack.services.store` so callers never
 * branch on the host. `'github'` → `GitHubStore` (reads GitHub coordinates from
 * env); `'fs'` → `FsStore` (needs a `rootDir`).
 */

import type { DomainPack } from '@jeldon/config';
import { readGitHubEnv } from './env.js';
import { FsStore } from './fs-store.js';
import { GitHubStore } from './github-store.js';
import type { ContentValidator, FrontmatterCodec, Store } from './types.js';

export interface CreateStoreOptions {
  /** Articles directory relative to repo root. Default `src/content/articles`. */
  contentDir?: string;
  /** Frontmatter codec for the conflict-merge. Default = BoH port. */
  codec?: FrontmatterCodec;
  /** Optional pre-commit validation gate. */
  validate?: ContentValidator;
  /** Cloudflare `locals` (or omit to read process.env) — GitHub path only. */
  locals?: { runtime?: { env?: Record<string, string | undefined> } };
  /** Repo root — required for the `fs` path. */
  rootDir?: string;
  /** Injectable fetch — GitHub path only (tests). */
  fetchImpl?: typeof fetch;
  /** GitHub `User-Agent`. */
  userAgent?: string;
}

/**
 * Build the Store the loaded Domain Pack asks for. The `kind` defaults to
 * `pack.services.store` but can be forced.
 */
export function createStore(
  pack: Pick<DomainPack, 'services'>,
  opts: CreateStoreOptions = {},
): Store {
  const kind = pack.services.store;
  // Explicit opts win; otherwise read the config's contentDir; otherwise the
  // adapter's built-in default (`src/content/articles`).
  const contentDir = opts.contentDir ?? pack.services.contentDir;
  if (kind === 'fs') {
    if (!opts.rootDir) {
      throw new Error("createStore: services.store='fs' requires opts.rootDir");
    }
    return new FsStore({
      rootDir: opts.rootDir,
      contentDir,
      codec: opts.codec,
      validate: opts.validate,
    });
  }
  // Default: GitHub.
  return new GitHubStore({
    env: readGitHubEnv(opts.locals),
    contentDir,
    codec: opts.codec,
    validate: opts.validate,
    fetchImpl: opts.fetchImpl,
    userAgent: opts.userAgent,
  });
}
