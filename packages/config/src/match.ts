/**
 * Anchored matching helpers shared by every engine package that classifies a
 * host or looks for a term in prose.
 *
 * Body of Health shipped the same bug three times: a bare substring test.
 * `includes('t.co')` matched every host ending in `t.com` (reddit, chatgpt,
 * pinterest) and reported X as a site's top referrer; `includes('dr young')`
 * matched "Dr. Younger"; a brand phrase matched "a growing body of health
 * research". BoH fixed each copy separately and marked the pairs LOCKSTEP.
 * Here there is one copy, so a fix lands everywhere at once.
 */

/** Lowercased hostname of a URL or bare host, with a leading `www.` dropped. '' if unparseable. */
export function hostOf(urlOrHost: string | null | undefined): string {
  const raw = String(urlOrHost ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw.replace(/^\/\//, '')}`;
    return new URL(withScheme).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** True when `host` is one of `domains` or a subdomain of one. Never a substring match. */
export function hostIs(host: string, ...domains: string[]): boolean {
  const h = host.toLowerCase();
  return domains.some((d) => {
    const dd = d.toLowerCase().replace(/^www\./, '');
    return !!dd && (h === dd || h.endsWith(`.${dd}`));
  });
}

/**
 * A word-boundary regex for a brand or search term. Case-insensitive; a `.`
 * in the term is optional and may be followed by whitespace, and a space may
 * follow an optional `.` (so "dr. young" and "dr young" both match "Dr Young"
 * and "Dr. Young"); runs of whitespace match any whitespace. The term
 * cannot match inside a longer word ("dr young" does not match "Dr. Younger").
 */
export function termRegex(term: string, flags = 'i'): RegExp {
  const esc = String(term)
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\.\s*/g, '\\.?\\s*')
    .replace(/\s+/g, '\\.?\\s+');
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, flags);
}

/**
 * True when `term` appears in `text` as a whole term. `exclusions` are regex
 * sources for generic phrasings that contain the term but are not a mention
 * (e.g. "a growing body of health research"); matches of those are removed
 * from the text before the term is tested again.
 */
export function mentionsTerm(text: string, term: string, exclusions: string[] = []): boolean {
  const t = String(text ?? '');
  if (!term.trim() || !termRegex(term).test(t)) return false;
  if (!exclusions.length) return true;
  let stripped = t;
  for (const src of exclusions) stripped = stripped.replace(new RegExp(src, 'gi'), ' ');
  return termRegex(term).test(stripped);
}
