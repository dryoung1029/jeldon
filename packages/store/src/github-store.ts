/**
 * GitHubStore — content persistence on the GitHub Contents + Trees/Commits API.
 *
 * Faithful port of Body of Health `src/lib/admin/github.ts` (read/list/save/
 * delete + atomic Tree commits) and `src/pages/api/admin/drafts/[slug].ts`
 * (the PUT SHA-conflict re-fetch + frontmatter-merge + single retry).
 *
 * Domain-agnostic changes vs the source:
 *  - The articles directory is config (`contentDir`), not the hardcoded
 *    `src/content/articles` literal.
 *  - The conflict-merge parses/serializes through an injected `FrontmatterCodec`
 *    (default = port of BoH frontmatter.ts) instead of importing BoH's parser.
 *  - The optional pre-commit `ContentValidator` is injected, not hardwired to
 *    BoH's `validateArticleContent`.
 */

import { defaultFrontmatterCodec } from './frontmatter.js';
import type {
  ArticleFile,
  ArticleListing,
  CommitResult,
  ContentValidator,
  DataFile,
  FileWrite,
  FrontmatterCodec,
  GitHubEnv,
  SaveResult,
  Store,
} from './types.js';

const DEFAULT_CONTENT_DIR = 'src/content/articles';
const DEFAULT_USER_AGENT = 'jeldon-store';

export interface GitHubStoreOptions {
  env: GitHubEnv;
  /** Repo-relative directory holding `<slug>.md` articles. Default
   *  `src/content/articles`. */
  contentDir?: string;
  /** Frontmatter codec for the conflict-merge. Default = BoH port. */
  codec?: FrontmatterCodec;
  /** Optional pre-commit gate (e.g. `@jeldon/content-model::validateArticle`).
   *  Returns error strings; non-empty rejects the save. */
  validate?: ContentValidator;
  /** Sent as the GitHub `User-Agent`. */
  userAgent?: string;
  /** Injectable fetch (tests, custom transports). Default = global `fetch`. */
  fetchImpl?: typeof fetch;
}

// --- isomorphic base64 (Workers/browser btoa+atob; works on modern Node too) ---

function utf8ToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function base64ToUtf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

export class GitHubStore implements Store {
  private readonly env: GitHubEnv;
  private readonly contentDir: string;
  private readonly codec: FrontmatterCodec;
  private readonly validate?: ContentValidator;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GitHubStoreOptions) {
    this.env = opts.env;
    this.contentDir = (opts.contentDir ?? DEFAULT_CONTENT_DIR).replace(/\/+$/, '');
    this.codec = opts.codec ?? defaultFrontmatterCodec;
    this.validate = opts.validate;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private articlePath(slug: string): string {
    return `${this.contentDir}/${slug}.md`;
  }

  private api(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `https://api.github.com/repos/${this.env.owner}/${this.env.repo}${path}`;
    return this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': this.userAgent,
        ...(init.headers ?? {}),
      },
    });
  }

  async listArticles(): Promise<ArticleListing[]> {
    const res = await this.api(`/contents/${this.contentDir}?ref=${this.env.branch}`);
    if (!res.ok) throw new Error(`GitHub list failed: ${res.status} ${await res.text()}`);
    const items = (await res.json()) as Array<{
      name: string;
      path: string;
      sha: string;
      type: string;
    }>;
    return items
      .filter((i) => i.type === 'file' && i.name.endsWith('.md'))
      .map((i) => ({ slug: i.name.replace(/\.md$/, ''), path: i.path, sha: i.sha }));
  }

  async getArticle(slug: string): Promise<ArticleFile> {
    const path = this.articlePath(slug);
    const res = await this.api(`/contents/${path}?ref=${this.env.branch}`);
    if (!res.ok) throw new Error(`GitHub get failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      sha: string;
      content: string;
      encoding: string;
      path: string;
    };
    const content = data.encoding === 'base64' ? base64ToUtf8(data.content) : data.content;
    return { slug, path: data.path, sha: data.sha, content };
  }

  /** Low-level Contents-API PUT. Throws on any non-OK response (the conflict
   *  recovery lives in `saveArticle`). */
  private async putContents(
    path: string,
    content: string,
    sha: string | null,
    message: string,
  ): Promise<{ sha: string }> {
    const body: Record<string, unknown> = {
      message,
      content: utf8ToBase64(content),
      branch: this.env.branch,
    };
    if (sha) body.sha = sha;
    const res = await this.api(`/contents/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`GitHub save failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { content: { sha: string } };
    return { sha: data.content.sha };
  }

  async saveArticle(
    slug: string,
    content: string,
    sha: string | null,
    message: string,
  ): Promise<SaveResult> {
    // Optional pre-commit gate (BoH ran validateArticleContent here so a single
    // bad article can't abort the whole content build).
    if (this.validate) {
      const errors = this.validate(content);
      if (errors.length) {
        throw new Error(
          `Invalid article frontmatter — not saved:\n- ${errors.join('\n- ')}`,
        );
      }
    }

    const path = this.articlePath(slug);
    try {
      const result = await this.putContents(path, content, sha, message);
      return { sha: result.sha };
    } catch (err) {
      // SHA conflict: something committed to the file between read and save
      // (audio narration writing frontmatter out-of-band, a parallel save, a
      // cron). Re-fetch, merge frontmatter — fields on disk the incoming
      // version doesn't know about are preserved; body + known fields take the
      // incoming version. Retry once. Ported from [slug].ts PUT handler.
      const errMsg = (err as Error).message;
      if (!/409|expected|conflict|sha/i.test(errMsg)) throw err;

      const fresh = await this.getArticle(slug);
      const current = this.codec.parse(fresh.content);
      const incoming = this.codec.parse(content);
      const mergedFm: Record<string, unknown> = { ...incoming.frontmatter };
      for (const [k, v] of Object.entries(current.frontmatter)) {
        if (!(k in mergedFm)) mergedFm[k] = v;
      }
      const merged = this.codec.serialize({ frontmatter: mergedFm, body: incoming.body });
      const result = await this.putContents(
        path,
        merged,
        fresh.sha,
        `${message} (merged with concurrent change)`,
      );
      return { sha: result.sha, mergedFromConflict: true };
    }
  }

  async saveArticles(files: FileWrite[], message: string): Promise<CommitResult> {
    const tree = files.map((f) => ({
      path: this.articlePath(f.slug),
      content: f.content,
    }));
    return this.commitTree(tree, message);
  }

  async deleteArticle(slug: string, sha: string, message: string): Promise<void> {
    const path = this.articlePath(slug);
    const res = await this.api(`/contents/${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch: this.env.branch }),
    });
    if (!res.ok) throw new Error(`GitHub delete failed: ${res.status} ${await res.text()}`);
  }

  async deleteArticles(slugs: string[], message: string): Promise<CommitResult> {
    // sha: null tree entries remove paths (atomic multi-delete).
    const tree = slugs.map((slug) => ({ path: this.articlePath(slug), sha: null }));
    return this.commitTree(tree, message);
  }

  async getDataFile(path: string): Promise<DataFile | null> {
    const res = await this.api(`/contents/${path}?ref=${this.env.branch}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub get-file failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { sha: string; content: string; encoding: string };
    const content = data.encoding === 'base64' ? base64ToUtf8(data.content) : data.content;
    return { path, sha: data.sha, content };
  }

  async saveDataFile(
    path: string,
    content: string,
    sha: string | null,
    message: string,
  ): Promise<SaveResult> {
    const result = await this.putContents(path, content, sha, message);
    return { sha: result.sha };
  }

  /**
   * Atomic multi-file commit via the Trees/Commits API. Either all entries
   * write or none. Entries are `{ path, content }` (blob) or `{ path, sha:null }`
   * (delete). Ported from BoH `saveArticles` / `deleteArticles`.
   */
  private async commitTree(
    entries: Array<{ path: string; content?: string; sha?: null }>,
    message: string,
  ): Promise<CommitResult> {
    // 1. Current branch tip + its tree.
    const refRes = await this.api(`/git/ref/heads/${this.env.branch}`);
    if (!refRes.ok) throw new Error(`GitHub get-ref failed: ${refRes.status} ${await refRes.text()}`);
    const ref = (await refRes.json()) as { object: { sha: string } };
    const baseCommitSha = ref.object.sha;

    const commitRes = await this.api(`/git/commits/${baseCommitSha}`);
    if (!commitRes.ok) throw new Error(`GitHub get-commit failed: ${commitRes.status}`);
    const baseCommit = (await commitRes.json()) as { tree: { sha: string } };

    // 2. Blob per written file (deletes carry sha:null straight into the tree).
    const treeEntries = await Promise.all(
      entries.map(async (e) => {
        if (e.content === undefined) {
          return { path: e.path, mode: '100644', type: 'blob' as const, sha: null };
        }
        const blobRes = await this.api(`/git/blobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: utf8ToBase64(e.content), encoding: 'base64' }),
        });
        if (!blobRes.ok) throw new Error(`GitHub blob failed: ${blobRes.status} ${await blobRes.text()}`);
        const blob = (await blobRes.json()) as { sha: string };
        return { path: e.path, mode: '100644', type: 'blob' as const, sha: blob.sha };
      }),
    );

    // 3. New tree off the base.
    const treeRes = await this.api(`/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries }),
    });
    if (!treeRes.ok) throw new Error(`GitHub tree failed: ${treeRes.status} ${await treeRes.text()}`);
    const tree = (await treeRes.json()) as { sha: string };

    // 4. Commit.
    const newCommitRes = await this.api(`/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tree: tree.sha, parents: [baseCommitSha] }),
    });
    if (!newCommitRes.ok) throw new Error(`GitHub commit failed: ${newCommitRes.status} ${await newCommitRes.text()}`);
    const newCommit = (await newCommitRes.json()) as { sha: string };

    // 5. Move the branch ref forward (non-force).
    const updateRes = await this.api(`/git/refs/heads/${this.env.branch}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
    if (!updateRes.ok) throw new Error(`GitHub ref update failed: ${updateRes.status} ${await updateRes.text()}`);

    return { commitSha: newCommit.sha };
  }
}
