/** Join a site origin with a path-or-absolute URL. If `pathOrUrl` is already
 *  absolute (http/https), it's returned unchanged; otherwise it's appended to
 *  `siteUrl`. `siteUrl` trailing slash is normalized so we never double up. */
export function absUrl(siteUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = siteUrl.replace(/\/+$/, '');
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

/** The canonical org @id for a site (`<siteUrl>/#org`). */
export function orgId(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/#org`;
}

/** The canonical website @id for a site (`<siteUrl>/#website`). */
export function websiteId(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/#website`;
}
