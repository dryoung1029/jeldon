/**
 * The agent-kit template renderer. Deliberately tiny — four constructs:
 *   {{name}}                         substitute (plain text)
 *   {{#if name}} … {{/if}}           truthy block
 *   {{#unless name}} … {{/unless}}   falsy block
 *   {{#eq name "value"}} … {{/eq}}   equality block
 * Nesting works (innermost blocks resolve first). Unknown variables render as
 * empty strings and are reported so a template typo can't ship silently.
 */
export type Vars = Record<string, unknown>;

const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : Boolean(v));

export function renderTemplate(src: string, vars: Vars): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const get = (k: string) => {
    const v = vars[k];
    if (v === undefined) missing.add(k);
    return v;
  };

  let text = src;
  // Blocks: iterate until no block tags remain (handles nesting).
  const blockRe = /\{\{#(if|unless|eq) ([\w.]+)(?: "([^"]*)")?\}\}([\s\S]*?)\{\{\/\1\}\}/;
  let guard = 0;
  while (blockRe.test(text) && guard++ < 10_000) {
    text = text.replace(blockRe, (_m, kind: string, key: string, val: string | undefined, body: string) => {
      const v = get(key);
      const keep = kind === 'if' ? truthy(v) : kind === 'unless' ? !truthy(v) : String(v ?? '') === (val ?? '');
      return keep ? body : '';
    });
  }
  text = text.replace(/\{\{([\w.]+)\}\}/g, (_m, key: string) => {
    const v = get(key);
    return v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  });
  // Collapse runs of 3+ blank lines left behind by removed blocks.
  text = text.replace(/\n{3,}/g, '\n\n');
  return { text, missing: [...missing] };
}
