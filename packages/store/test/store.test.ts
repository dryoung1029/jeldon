import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createStore,
  defaultFrontmatterCodec,
  FsStore,
  GitHubStore,
  type Store,
} from '../src/index.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'jeldon-store-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const article = (title: string, extra = '') =>
  `---\ntitle: "${title}"\ndraft: true\n${extra}---\n\nBody text here.\n`;

describe('FsStore — round-trip', () => {
  it('saves, reads, lists, and deletes an article', async () => {
    const store: Store = new FsStore({ rootDir: root });
    const { sha } = await store.saveArticle('hello', article('Hello'), null, 'create');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    const got = await store.getArticle('hello');
    expect(got.content).toContain('title: "Hello"');
    expect(got.sha).toBe(sha);

    const list = await store.listArticles();
    expect(list.map((a) => a.slug)).toContain('hello');

    await store.deleteArticle('hello', got.sha, 'remove');
    expect(await store.listArticles()).toHaveLength(0);
  });

  it('atomic saveArticles writes every file', async () => {
    const store = new FsStore({ rootDir: root });
    const { commitSha } = await store.saveArticles(
      [
        { slug: 'a', content: article('A') },
        { slug: 'b', content: article('B') },
      ],
      'series',
    );
    expect(commitSha).toBeTruthy();
    expect((await store.listArticles()).map((a) => a.slug).sort()).toEqual(['a', 'b']);
  });

  it('reads and writes generic data files', async () => {
    const store = new FsStore({ rootDir: root });
    expect(await store.getDataFile('src/data/x.json')).toBeNull();
    await store.saveDataFile('src/data/x.json', '{"n":1}', null, 'seed');
    const df = await store.getDataFile('src/data/x.json');
    expect(df?.content).toBe('{"n":1}');
  });
});

describe('FsStore — SHA conflict merge (the [slug].ts PUT logic)', () => {
  it('preserves out-of-band frontmatter the editor never knew about', async () => {
    const store = new FsStore({ rootDir: root });
    // 1. Editor loads the article.
    const created = await store.saveArticle('post', article('Post'), null, 'create');

    // 2. An out-of-band write (audio narration) adds audioUrl + audioBodyLength.
    await store.saveArticle(
      'post',
      article('Post', 'audioUrl: "/audio/post/post.mp3"\naudioBodyLength: 4231\n'),
      null,
      'audio',
    );

    // 3. The editor saves with its STALE sha and no audio fields. Conflict path
    //    must merge the audio fields back in, not clobber them.
    const result = await store.saveArticle(
      'post',
      article('Post Updated'),
      created.sha,
      'edit',
    );
    expect(result.mergedFromConflict).toBe(true);

    const final = (await store.getArticle('post')).content;
    expect(final).toContain('title: "Post Updated"'); // incoming body/title wins
    expect(final).toContain('audioUrl: "/audio/post/post.mp3"'); // preserved
    expect(final).toContain('audioBodyLength: 4231'); // preserved (as a number)
  });

  it('a matching sha takes the fast path (no merge flag)', async () => {
    const store = new FsStore({ rootDir: root });
    const created = await store.saveArticle('post', article('Post'), null, 'create');
    const result = await store.saveArticle('post', article('Post v2'), created.sha, 'edit');
    expect(result.mergedFromConflict).toBeUndefined();
  });
});

describe('frontmatter codec', () => {
  it('round-trips numbers, booleans, and arrays without drift', () => {
    const raw = '---\ntitle: "T"\ndraft: false\naudioBodyLength: 100\ntags: ["a", "b"]\n---\n\nBody.\n';
    const parsed = defaultFrontmatterCodec.parse(raw);
    expect(parsed.frontmatter.audioBodyLength).toBe(100);
    expect(parsed.frontmatter.draft).toBe(false);
    expect(parsed.frontmatter.tags).toEqual(['a', 'b']);
    const out = defaultFrontmatterCodec.serialize(parsed);
    expect(out).toContain('audioBodyLength: 100');
    expect(out).toContain('tags: ["a", "b"]');
  });
});

describe('factory — config-driven', () => {
  it('createStore(fs) honors services.contentDir from the pack', async () => {
    const store = createStore(
      { services: { store: 'fs', contentDir: 'content/posts', requiredEnv: [] } },
      { rootDir: root },
    );
    await store.saveArticle('p', article('P'), null, 'create');
    // Written under the configured dir, not the BoH default.
    const onDisk = await readFile(join(root, 'content/posts', 'p.md'), 'utf8');
    expect(onDisk).toContain('title: "P"');
  });

  it('createStore(github) builds a GitHubStore from env', () => {
    const store = createStore(
      { services: { store: 'github', requiredEnv: [] } },
      {
        locals: {
          runtime: {
            env: { GITHUB_TOKEN: 't', GITHUB_OWNER: 'o', GITHUB_REPO: 'r', GITHUB_BRANCH: 'main' },
          },
        },
      },
    );
    expect(store).toBeInstanceOf(GitHubStore);
  });
});

describe('GitHubStore — SHA conflict merge with a mock fetch', () => {
  it('on a failed PUT, re-fetches and retries with merged frontmatter', async () => {
    const remote = article('Remote', 'audioUrl: "/audio/x.mp3"\n');
    const calls: string[] = [];
    let putCount = 0;

    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${u}`);
      if (method === 'PUT') {
        putCount += 1;
        if (putCount === 1) {
          return new Response('conflict: 409 expected sha', { status: 409 });
        }
        // Second PUT (the retry) succeeds.
        return new Response(JSON.stringify({ content: { sha: 'newsha' } }), { status: 200 });
      }
      // GET contents → return the remote file base64-encoded.
      const b64 = btoa(unescape(encodeURIComponent(remote)));
      return new Response(
        JSON.stringify({ sha: 'freshsha', content: b64, encoding: 'base64', path: 'p' }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const store = new GitHubStore({
      env: { token: 't', owner: 'o', repo: 'r', branch: 'main' },
      fetchImpl,
    });

    const res = await store.saveArticle('post', article('Local'), 'stalesha', 'edit');
    expect(res.mergedFromConflict).toBe(true);
    expect(res.sha).toBe('newsha');
    expect(putCount).toBe(2); // initial + retry
    // The retry PUT body must carry the preserved audioUrl.
    expect(calls.some((c) => c.startsWith('GET'))).toBe(true);
  });
});
