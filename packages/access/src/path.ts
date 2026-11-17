/**
 * The protection test. The raw pathname alone is NOT safe: the router decodes
 * and collapses what the pathname keeps literal, so `//api/admin/drafts` and
 * `/api/%61dmin/drafts` both rendered the admin handler while a raw
 * `startsWith('/api/admin')` said "public" (measured in the source system on
 * a deployment URL the Access policy did not cover). So there are two
 * independent tests, either one enough to require a token: the canonicalised
 * request path, and the route pattern the framework actually chose.
 */

/**
 * The path as a router could understand it, for the protection test ONLY.
 * Deliberately a SUPERSET of what the router matches: over-protecting an odd
 * URL costs nothing, under-protecting one is the bug.
 *
 * Decodes up to 3 times, turns `\` into `/`, strips `;params`, collapses
 * `//`, resolves `.` / `..`, lowercases. Returns `null` when the path cannot
 * be decoded; callers MUST treat null as protected (fail closed).
 */
export function canonicalPath(raw: string): string | null {
  let p = raw;
  try {
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(p);
      if (next === p) break;
      p = next;
    }
  } catch {
    return null;
  }
  p = p.replace(/\\/g, '/').replace(/;[^/]*/g, '').replace(/\/{2,}/g, '/');
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return ('/' + out.join('/')).toLowerCase();
}

function underPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((raw) => {
    const p = raw.toLowerCase().replace(/\/+$/, '');
    if (!p) return true; // a "/" prefix protects everything
    return path === p || path.startsWith(p + '/');
  });
}

/**
 * True when the request needs a verified token: the path cannot be decoded,
 * OR its canonical form is under a prefix, OR the matched route pattern
 * (e.g. Astro's `ctx.routePattern`, `/api/admin/[...slug]`) is under one.
 * `path` may be raw or already canonical — it is canonicalised again, which
 * can only widen the match.
 */
export function isProtected(
  path: string | null,
  routePattern: string | null | undefined,
  prefixes: readonly string[],
): boolean {
  if (path === null) return true;
  const canon = canonicalPath(path);
  if (canon === null || underPrefix(canon, prefixes)) return true;
  if (routePattern) {
    const route = canonicalPath(routePattern);
    if (route === null || underPrefix(route, prefixes)) return true;
  }
  return false;
}
