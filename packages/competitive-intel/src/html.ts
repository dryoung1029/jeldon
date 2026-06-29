// HTML helpers — regex-based, dependency-free, so they run identically in Node
// and Cloudflare Workers. Ported verbatim from Body of Health
// `competitor-scanner.ts` (pick / decode / stripTags / htmlToScorableMarkdown /
// extractSchema). No domain coupling here — pure string mechanics.

export function pick(re: RegExp, html: string): string | null {
  const m = html.match(re);
  return m && m[1] != null ? decode(m[1].trim()) : null;
}

export function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function originOf(u: string): string {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
}

/**
 * Convert HTML to a markdown-ish projection that the GEO scorer can read
 * correctly. The article scorer detects question-style H2s via `^## ...`
 * (markdown convention), but competitor pages are HTML — so we promote heading
 * tags to markdown headings before stripping. Nav/footer/aside are dropped to
 * cut boilerplate noise, and `<a href>` becomes `[text](URL)` BEFORE the
 * generic tag-strip so the citation-density regex still finds source URLs.
 */
export function htmlToScorableMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n\n# ${stripTags(c)}\n\n`)
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n\n## ${stripTags(c)}\n\n`)
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n\n### ${stripTags(c)}\n\n`)
    .replace(
      /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, content) => `[${stripTags(content)}](${href})`,
    )
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type SchemaAuditResult = {
  types: string[];
  raw: unknown[];
  count: number;
  fieldsByType?: Record<string, string[]>;
};

/** Extract every JSON-LD block's @types and per-type populated field names. */
export function extractSchema(html: string): SchemaAuditResult {
  const blocks = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  const types = new Set<string>();
  const raw: unknown[] = [];
  const fieldsByType: Record<string, Set<string>> = {};
  for (const m of blocks) {
    try {
      const parsed = JSON.parse((m[1] ?? '').trim());
      raw.push(parsed);
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed['@graph']
          ? parsed['@graph']
          : [parsed];
      for (const node of arr) {
        if (!node || typeof node !== 'object') continue;
        const t = node['@type'];
        const typeNames: string[] =
          typeof t === 'string'
            ? [t]
            : Array.isArray(t)
              ? t.filter((x: unknown): x is string => typeof x === 'string')
              : [];
        for (const tn of typeNames) {
          types.add(tn);
          const set = (fieldsByType[tn] ??= new Set());
          for (const key of Object.keys(node)) {
            if (key === '@type' || key === '@context' || key === '@id' || key === '@graph') continue;
            const v = node[key];
            const populated = v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
            if (populated) set.add(key);
          }
        }
      }
    } catch {
      /* malformed JSON-LD is common; skip */
    }
  }
  const fieldsByTypeArr: Record<string, string[]> = {};
  for (const [t, set] of Object.entries(fieldsByType)) fieldsByTypeArr[t] = Array.from(set).sort();
  return { types: Array.from(types).sort(), raw, count: blocks.length, fieldsByType: fieldsByTypeArr };
}
