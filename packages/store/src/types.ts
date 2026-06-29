/**
 * The Store contract — the engine's only door to content persistence.
 *
 * Ported from Body of Health `src/lib/admin/github.ts` (the GitHub-as-database
 * pattern) + `src/pages/api/admin/drafts/[slug].ts` (the PUT SHA-conflict merge).
 * Per docs/DECOUPLING-NOTES.md "GitHub-as-database": reach content through this
 * interface, never through `github.ts` directly. `GitHubStore` is the default
 * adapter; `FsStore` is the test / non-GitHub fallback.
 */

/** A versioned article, addressed by slug. `sha` is the optimistic-concurrency
 *  token (GitHub blob sha; FsStore synthesizes a content hash). */
export interface ArticleFile {
  slug: string;
  /** Repo-relative path, e.g. `src/content/articles/<slug>.md`. */
  path: string;
  sha: string;
  /** Full markdown including frontmatter. */
  content: string;
}

export interface ArticleListing {
  slug: string;
  path: string;
  sha: string;
}

/** One file in an atomic multi-write. */
export interface FileWrite {
  slug: string;
  content: string;
}

/** A versioned generic JSON/data file, addressed by repo-relative path. */
export interface DataFile {
  path: string;
  sha: string;
  content: string;
}

export interface SaveResult {
  sha: string;
  /** True when a 409 conflict triggered the re-fetch + frontmatter-merge path. */
  mergedFromConflict?: boolean;
}

export interface CommitResult {
  commitSha: string;
}

/**
 * Persistence contract. Implementations: `GitHubStore` (Contents/Trees API),
 * `FsStore` (local filesystem). The conflict semantics live in `saveArticle`:
 * on a 409 the store re-fetches, merges frontmatter (out-of-band fields on the
 * remote that the incoming version doesn't know about are preserved), and
 * retries once — exactly the `[slug].ts` PUT recovery path.
 */
export interface Store {
  /** List every article (slug + path + sha). */
  listArticles(): Promise<ArticleListing[]>;

  /** Read one article. Throws if missing. */
  getArticle(slug: string): Promise<ArticleFile>;

  /**
   * Save one article. Pass the `sha` you read to enable optimistic concurrency.
   * On a 409 conflict the store re-fetches the current file, merges frontmatter
   * (the incoming body + known fields win; remote-only fields like audio
   * metadata are preserved), and retries once. Pass `sha: null` to create or
   * blind-overwrite.
   */
  saveArticle(
    slug: string,
    content: string,
    sha: string | null,
    message: string,
  ): Promise<SaveResult>;

  /** Atomic multi-file commit — all files write or none (series creation,
   *  cross-draft moves). */
  saveArticles(files: FileWrite[], message: string): Promise<CommitResult>;

  /** Delete one article (sha-checked). */
  deleteArticle(slug: string, sha: string, message: string): Promise<void>;

  /** Atomic multi-file delete. */
  deleteArticles(slugs: string[], message: string): Promise<CommitResult>;

  /** Read a generic data file by repo-relative path. `null` when absent. */
  getDataFile(path: string): Promise<DataFile | null>;

  /** Write a generic data file by repo-relative path. */
  saveDataFile(
    path: string,
    content: string,
    sha: string | null,
    message: string,
  ): Promise<SaveResult>;
}

/**
 * Pluggable frontmatter codec used by `saveArticle`'s conflict-merge. The store
 * doesn't hardcode any one domain's frontmatter dialect — it merges fields, so
 * it needs to parse + re-serialize. The default (`defaultFrontmatterCodec`) is
 * a faithful port of BoH `src/lib/admin/frontmatter.ts`; a project with a YAML
 * lib can inject its own.
 */
export interface FrontmatterCodec {
  parse(raw: string): { frontmatter: Record<string, unknown>; body: string };
  serialize(doc: { frontmatter: Record<string, unknown>; body: string }): string;
}

/**
 * Optional pre-commit validation gate (the `validateArticleContent` call in the
 * BoH PUT handler). Return a list of error strings; non-empty rejects the save
 * before it commits. The engine ships no validator here — `@jeldon/content-model`
 * owns article validation. Inject one if you want the gate.
 */
export type ContentValidator = (content: string) => string[];

/** GitHub coordinates. Resolved from env by `readGitHubEnv`. */
export interface GitHubEnv {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}
