import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  articlePath,
  articlePathPattern,
  articlePathPrefix,
  authorPath,
  draftingMode,
  validateDomainPack,
} from '../src/index.js';

const dist = resolve(__dirname, '../dist');
const NODE_IMPORT = /from\s*['"](?:node:)?(?:fs|path|url|os|child_process)(?:\/promises)?['"]/;

/** Follow static `import ... from './x.js'` edges from a dist file. */
function staticGraph(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry) || !existsSync(entry)) return seen;
  seen.add(entry);
  const src = readFileSync(entry, 'utf8');
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s*['"](\.[^'"]+)['"]/gm)) {
    staticGraph(resolve(dist, m[1]!), seen);
  }
  return seen;
}

describe('@jeldon/config entry points (Helix finding #8)', () => {
  // These assertions read the built dist, so they need `pnpm build` first —
  // which turbo guarantees (test dependsOn ^build + the package's own build).
  const built = existsSync(resolve(dist, 'index.js'));

  it.skipIf(!built)('the root entry has no static node:* import anywhere in its graph', () => {
    const files = staticGraph(resolve(dist, 'index.js'));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // esbuild may strip the `node:` scheme, so match the bare builtins too.
      expect(src, `${f} imports a node builtin`).not.toMatch(NODE_IMPORT);
      expect(src, `${f} requires a node builtin`).not.toMatch(/require\(\s*['"](?:node:)?(?:fs|path|url|os|child_process)/);
      expect(src, `${f} imports jiti`).not.toMatch(/from\s*['"]jiti['"]/);
    }
  });

  it.skipIf(!built)('the ./load entry exists and is the one that uses jiti + node:fs', () => {
    const load = readFileSync(resolve(dist, 'load.js'), 'utf8');
    expect(load).toMatch(NODE_IMPORT);
    expect(load).toMatch(/jiti/);
    expect(readdirSync(dist)).toContain('load.d.ts');
  });
});

const minimalPack = {
  brand: { name: 'Acme', siteUrl: 'https://acme.test' },
  authors: [{ slug: 'a', name: 'A', schemaId: 'https://acme.test/#a', profile: { name: 'A' } }],
  voice: { persona: 'p', bannedTopics: [], bannedPhrasings: [], rules: [], voiceAnchorUrls: [], readingGradeBand: [6, 9] },
  content: { categories: ['guide'], categoryTargets: { guide: 80 }, defaultAuthorSlug: 'a', timezone: 'UTC' },
  scoring: {
    geo: { floor: 70, checks: [{ id: 'x', label: 'x', weight: 1, kind: 'regexCount', patterns: ['a'], thresholds: [1, 0] }] },
    seo: {
      title: { good: [40, 60], mehMax: 70 }, excerpt: { good: [120, 160], meh: [80, 200] }, slugMaxLen: 60,
      wordCount: { good: [800, 2200], mehMin: 500 }, bodyChars: { good: 10000, meh: 12000 }, h2: { good: [3, 6], meh: [2, 8] },
      internalLinks: { good: 2, meh: 1 }, tags: { good: [3, 6], mehMin: 1 }, heroAltWords: { good: [4, 18] },
      reading: { good: [6, 9], mehMax: 11 }, internalLinkPrefixes: ['articles'], referenceSectionNames: ['references'],
      evidenceTriggers: [], badFilenameRe: 'x',
    },
  },
  citation: { policy: 'direct-source-urls', forbiddenPatterns: [], referenceFormat: 'f', verifier: { kind: 'none' } },
  aeo: { brandMentions: ['acme'], querySet: [{ id: 'q', query: 'q', tags: [] }], engines: ['perplexity'], highPriorityTags: [] },
  schema: { orgType: ['Organization'], org: { name: 'Acme', url: 'https://acme.test' }, articleTypes: ['Article'] },
  capabilities: {},
  services: { store: 'fs', requiredEnv: [] },
};

describe('article + author URL prefixes are Domain Pack values (Helix finding #3)', () => {
  it('defaults to /articles/ and /team/', () => {
    const pack = validateDomainPack(minimalPack).data!;
    expect(articlePathPrefix(pack)).toBe('/articles/');
    expect(articlePath(pack, 'hello')).toBe('/articles/hello/');
    expect(authorPath(pack.authors[0], 'a', pack)).toBe('/team/a');
    expect(articlePathPattern(pack)).toBe('^/articles/([a-z0-9-]+)/?$');
  });

  it('a /blog/ pack + /coaches/ author change every derived path with no engine change', () => {
    const r = validateDomainPack({
      ...minimalPack,
      content: { ...minimalPack.content, articlePathPrefix: 'blog' },
      authors: [{ ...minimalPack.authors[0], urlPrefix: '/coaches' }],
    });
    expect(r.ok).toBe(true);
    const pack = r.data!;
    expect(pack.content.articlePathPrefix).toBe('/blog/'); // normalized on parse
    expect(articlePath(pack, 'hello')).toBe('/blog/hello/');
    expect(articlePathPattern(pack)).toBe('^/blog/([a-z0-9-]+)/?$');
    expect(authorPath(pack.authors[0], 'a', pack)).toBe('/coaches/a');
  });

  it('rejects a prefix that is not a path segment', () => {
    const r = validateDomainPack({ ...minimalPack, content: { ...minimalPack.content, articlePathPrefix: 'http://x' } });
    expect(r.ok).toBe(false);
  });
});

describe('capabilities.drafting modes', () => {
  it('true → api, agent → agent, false/omitted → false', () => {
    expect(draftingMode({ capabilities: { drafting: true } })).toBe('api');
    expect(draftingMode({ capabilities: { drafting: 'agent' } })).toBe('agent');
    expect(draftingMode({ capabilities: {} })).toBe(false);
    expect(validateDomainPack({ ...minimalPack, capabilities: { drafting: 'agent' } }).ok).toBe(true);
  });
});
