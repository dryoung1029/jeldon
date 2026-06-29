import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArticleDoc, ArticleSource } from './publish.js';

/**
 * Filesystem-backed `ArticleSource` — the default I/O adapter for the publish
 * cron, ported from `scripts/publish-scheduled.mjs`'s `readdir`/`readFile`/
 * `writeFile` against `src/content/articles`. Node-only.
 */
export class FsArticleSource implements ArticleSource {
  constructor(private dir: string) {}

  async list(): Promise<ArticleDoc[]> {
    const files = await readdir(this.dir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    const docs: ArticleDoc[] = [];
    for (const file of mdFiles) {
      const raw = await readFile(join(this.dir, file), 'utf8');
      docs.push({ id: file, raw });
    }
    return docs;
  }

  async write(id: string, raw: string): Promise<void> {
    await writeFile(join(this.dir, id), raw, 'utf8');
  }
}
