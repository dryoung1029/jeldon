import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubStore } from '../src/index.js';

// Cloudflare Workers throw "Illegal invocation" when fetch runs with a `this`
// that isn't globalThis. GitHubStore used to keep the global fetch on
// `this.fetchImpl` and call it as a method, which broke every read on Workers.
function workersStyleFetch(this: unknown): Promise<Response> {
  if (this !== undefined && this !== globalThis) {
    return Promise.reject(new TypeError('Illegal invocation: function called with incorrect `this` reference.'));
  }
  return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

const env = { token: 't', owner: 'o', repo: 'r', branch: 'main' };

describe('GitHubStore on a Workers-style fetch', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('works with the default (global) fetch', async () => {
    globalThis.fetch = workersStyleFetch as typeof fetch;
    await expect(new GitHubStore({ env }).listArticles()).resolves.toEqual([]);
  });

  it('works when the caller passes the bare global fetch', async () => {
    const spy = vi.fn(workersStyleFetch);
    await expect(new GitHubStore({ env, fetchImpl: spy as unknown as typeof fetch }).listArticles()).resolves.toEqual([]);
    expect(spy).toHaveBeenCalledOnce();
  });
});
