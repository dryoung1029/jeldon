/**
 * Internal frontmatter micro-helpers shared by the drafting post-processors
 * (tag reconcile, hero alt/image). This is NOT a general parser — just enough to
 * read a scalar field and surgically upsert one line, matching the shape the
 * drafting prompts emit. The full round-trip codec is @jeldon/store's; the
 * scorer-facing read is `DraftFrontmatterCodec`. Keeping these here in one place
 * stops a third frontmatter parser from drifting (see docs/DECOUPLING-NOTES.md,
 * "Frontmatter parser ×3").
 */

export interface SplitDoc {
  fm: string;
  body: string;
  matched: boolean;
}

/** Split a draft into its frontmatter block + body. `matched` is false when
 *  there is no `---` frontmatter fence. */
export function splitFrontmatter(content: string): SplitDoc {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: '', body: content, matched: false };
  return { fm: m[1] ?? '', body: m[2] ?? '', matched: true };
}

/** Read a single-line scalar field, stripping surrounding quotes. '' when absent. */
export function fmScalar(fm: string, key: string): string {
  const line = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!line || line[1] === undefined) return '';
  return line[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Replace `key:`'s line with a JSON-quoted scalar, or insert it as the last
 * frontmatter field when absent. Returns content unchanged when there is no
 * frontmatter block (a scalar without frontmatter has nowhere meaningful to go).
 */
export function upsertScalar(content: string, key: string, value: string): string {
  const line = `${key}: ${JSON.stringify(value)}`;
  const re = new RegExp(`^${key}:.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  return content.replace(/^(---\r?\n[\s\S]*?)(\r?\n---)/, `$1\n${line}$2`);
}
