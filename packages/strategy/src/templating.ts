// Minimal, dependency-free `{token}` interpolation for copy templates. Unknown
// tokens are left intact (so a missing fact is visible, not silently blanked).
// Numbers are localized; everything else is stringified as-is.
export function fill(template: string, tokens: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!(key in tokens)) return whole;
    const v = tokens[key];
    return typeof v === 'number' ? v.toLocaleString() : String(v);
  });
}
