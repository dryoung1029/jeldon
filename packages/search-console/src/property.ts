/**
 * Property-id format. Search Console treats these as different records, and
 * using the wrong one 403s exactly like a missing permission grant:
 *   - domain property:     `sc-domain:example.com`  (no scheme, no slash)
 *   - URL-prefix property: `https://example.com/`   (scheme + trailing slash)
 * `http://` and `https://` prefixes are separate properties too.
 */

export type PropertyCheck =
  | { ok: true; kind: 'domain' | 'url-prefix'; host: string; warning?: string }
  | { ok: false; error: string; suggestion?: string };

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function checkPropertyFormat(raw: string | undefined | null): PropertyCheck {
  const p = (raw ?? '').trim();
  if (!p) return { ok: false, error: 'property is empty' };
  if (p !== raw) {
    return { ok: false, error: 'property has leading/trailing whitespace — Search Console matches the string exactly', suggestion: p };
  }
  if (p.startsWith('sc-domain:')) {
    const host = p.slice('sc-domain:'.length);
    if (/^[a-z]+:\/\//i.test(host) || host.includes('/')) {
      const bare = host.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
      return { ok: false, error: 'a domain property has no scheme or path', suggestion: `sc-domain:${bare}` };
    }
    if (!HOST_RE.test(host)) return { ok: false, error: `"${host}" is not a valid host name` };
    return { ok: true, kind: 'domain', host: host.toLowerCase() };
  }
  const m = p.match(/^(https?):\/\/([^/]+)(\/.*)?$/i);
  if (m) {
    const scheme = (m[1] as string).toLowerCase();
    const host = m[2] as string;
    const path = m[3] ?? '';
    if (!HOST_RE.test(host.replace(/:\d+$/, ''))) return { ok: false, error: `"${host}" is not a valid host name` };
    if (!path.endsWith('/')) {
      return {
        ok: false,
        error: 'a URL-prefix property must end with a trailing slash',
        suggestion: `${scheme}://${host}${path}/`,
      };
    }
    if (scheme === 'http') {
      return {
        ok: true,
        kind: 'url-prefix',
        host: host.toLowerCase(),
        warning: 'http:// and https:// are different Search Console properties — use http:// only if that is the exact property shown in Search Console',
      };
    }
    return { ok: true, kind: 'url-prefix', host: host.toLowerCase() };
  }
  if (HOST_RE.test(p)) {
    return {
      ok: false,
      error: 'a bare host is not a property id',
      suggestion: `sc-domain:${p.toLowerCase()} (domain property) or https://${p.toLowerCase()}/ (URL-prefix property)`,
    };
  }
  return { ok: false, error: 'property must be `sc-domain:<host>` or `https://<host>/`' };
}

/** Host of a property id, or null. Used to match alternate forms of one site. */
export function propertyHost(p: string): string | null {
  const c = checkPropertyFormat(p);
  if (c.ok) return c.host;
  const m = p.match(/^(?:sc-domain:)?(?:https?:\/\/)?([^/\s]+)/i);
  return m ? (m[1] as string).toLowerCase() : null;
}
