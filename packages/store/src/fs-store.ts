/**
 * FsStore — local-filesystem implementation of the Store contract.
 *
 * The fallback for tests and non-GitHub hosts (per docs/DECOUPLING-NOTES.md:
 * "GitHubStore default + FsStore fallback"). There is no remote branch, so the
 * `sha` token is a synthesized content hash; multi-file writes are sequential
 * but treated as one logical commit (a process-local mutex serializes them so a
 * concurrent `saveArticles` can't interleave). The conflict-merge mirrors
 * `GitHubStore`: if the caller's `sha` no longer matches what's on disk, the
 * store re-reads, merges frontmatter (remote-only fields preserved), and retries.
 */

import { createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { defaultFrontmatterCodec } from './frontmatter.js';
import type {
  ArticleFile,
  ArticleListing,
  CommitResult,
  ContentValidator,
  DataFile,
  FileWrite,
  FrontmatterCodec,
  SaveResult,
  Store,
} from './types.js';

const DEFAULT_CONTENT_DIR = 'src/content/articles';

export interface FsStoreOptions {
  /** Repo root. All paths resolve against this. */
  rootDir: string;
  /** Articles directory relative to `rootDir`. Default `src/content/articles`. */
  contentDir?: string;
  codec?: FrontmatterCodec;
  validate?: ContentValidator;
}

function hashContent(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex');
}

export class FsStore implements Store {
  private readonly rootDir: string;
  private readonly contentDir: string;
  private readonly codec: FrontmatterCodec;
  private readonly validate?: ContentValidator;
  /** Serializes mutations so concurrent multi-file writes don't interleave. */
  private lock: Promise<unknown> = Promise.resolve();

  constructor(opts: FsStoreOptions) {
    this.rootDir = resolve(opts.rootDir);
    this.contentDir = (opts.contentDir ?? DEFAULT_CONTENT_DIR).replace(/\/+$/, '');
    this.codec = opts.codec ?? defaultFrontmatterCodec;
    this.validate = opts.validate;
  }

  private articleAbsPath(slug: string): string {
    return join(this.rootDir, this.contentDir, `${slug}.md`);
  }

  private articleRelPath(slug: string): string {
    return `${this.contentDir}/${slug}.md`;
  }

  /** Run a mutation under the process-local mutex. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    // Keep the chain alive but swallow rejection so one failure doesn't poison
    // every subsequent write.
    this.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async listArticles(): Promise<ArticleListing[]> {
    const dir = join(this.rootDir, this.contentDir);
    if (!existsSync(dir)) return [];
    const names = await readdir(dir);
    const out: ArticleListing[] = [];
    for (const name of names) {
      if (!name.endsWith('.md')) continue;
      const slug = name.replace(/\.md$/, '');
      const content = await readFile(join(dir, name), 'utf8');
      out.push({ slug, path: this.articleRelPath(slug), sha: hashContent(content) });
    }
    return out;
  }

  async getArticle(slug: string): Promise<ArticleFile> {
    const abs = this.articleAbsPath(slug);
    if (!existsSync(abs)) throw new Error(`FsStore get failed: ${this.articleRelPath(slug)} not found`);
    const content = await readFile(abs, 'utf8');
    return { slug, path: this.articleRelPath(slug), sha: hashContent(content), content };
  }

  async saveArticle(
    slug: string,
    content: string,
    sha: string | null,
    _message: string,
  ): Promise<SaveResult> {
    if (this.validate) {
      const errors = this.validate(content);
      if (errors.length) {
        throw new Error(`Invalid article frontmatter — not saved:\n- ${errors.join('\n- ')}`);
      }
    }
    return this.serialize(async () => {
      const abs = this.articleAbsPath(slug);
      const exists = existsSync(abs);

      if (sha && exists) {
        const onDisk = await readFile(abs, 'utf8');
        const currentSha = hashContent(onDisk);
        if (currentSha !== sha) {
          // Conflict: merge frontmatter (incoming body + known fields win;
          // disk-only fields preserved), then write. Mirrors GitHubStore.
          const current = this.codec.parse(onDisk);
          const incoming = this.codec.parse(content);
          const mergedFm: Record<string, unknown> = { ...incoming.frontmatter };
          for (const [k, v] of Object.entries(current.frontmatter)) {
            if (!(k in mergedFm)) mergedFm[k] = v;
          }
          const merged = this.codec.serialize({ frontmatter: mergedFm, body: incoming.body });
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, merged, 'utf8');
          return { sha: hashContent(merged), mergedFromConflict: true };
        }
      }

      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
      return { sha: hashContent(content) };
    });
  }

  async saveArticles(files: FileWrite[], message: string): Promise<CommitResult> {
    return this.serialize(async () => {
      for (const f of files) {
        const abs = this.articleAbsPath(f.slug);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, f.content, 'utf8');
      }
      return { commitSha: hashContent(message + files.map((f) => f.slug).join(',') + Date.now()) };
    });
  }

  async deleteArticle(slug: string, _sha: string, _message: string): Promise<void> {
    await this.serialize(async () => {
      const abs = this.articleAbsPath(slug);
      if (existsSync(abs)) await rm(abs);
    });
  }

  async deleteArticles(slugs: string[], message: string): Promise<CommitResult> {
    return this.serialize(async () => {
      for (const slug of slugs) {
        const abs = this.articleAbsPath(slug);
        if (existsSync(abs)) await rm(abs);
      }
      return { commitSha: hashContent(message + slugs.join(',') + Date.now()) };
    });
  }

  async getDataFile(path: string): Promise<DataFile | null> {
    const abs = join(this.rootDir, path);
    if (!existsSync(abs)) return null;
    const content = await readFile(abs, 'utf8');
    return { path: relative(this.rootDir, abs).replace(/\\/g, '/'), sha: hashContent(content), content };
  }

  async saveDataFile(
    path: string,
    content: string,
    _sha: string | null,
    _message: string,
  ): Promise<SaveResult> {
    return this.serialize(async () => {
      const abs = join(this.rootDir, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
      return { sha: hashContent(content) };
    });
  }
}
