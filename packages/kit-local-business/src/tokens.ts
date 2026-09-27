/**
 * Design tokens from the Domain Pack. `brand.brandColors` (a named palette)
 * + `brand.fonts` + the kit's role map (`theme.primary` → a palette key)
 * become the CSS custom properties every kit page uses. Derived shades
 * (deep / tint) are computed, so a consumer sets ONE hex per role. Light and
 * dark schemes both come out of here. The base stylesheet (layout, buttons,
 * forms, prose) is appended; the "one accent per page" and "no SaaS card kit"
 * conventions are documented in the kit's DESIGN.md, not enforced in CSS.
 */

export interface TokenInput {
  brandColors?: Record<string, string>;
  fonts?: { display?: string; body?: string; googleFontsHref?: string };
  theme?: { primary?: string; accent?: string; neutral?: string; highlight?: string; fontFamily?: string };
}

export interface ResolvedTheme {
  primary: string;
  primaryDeep: string;
  primaryTint: string;
  primaryDark: string;
  primaryDeepDark: string;
  primaryTintDark: string;
  accent: string;
  accentDeep: string;
  neutral: string;
  highlight: string;
  fontStack: string;
  googleFontsHref?: string;
}

const FALLBACK = { primary: '#1f6feb', accent: '#d1242f', neutral: '#24292f', highlight: '#e8b04a' };

export function hexToHsl(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** Shift lightness by `delta` (−1..1), clamped. */
export function shade(hex: string, delta: number, satDelta = 0): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const [h, s, l] = hsl;
  return hslToHex(h, Math.max(0, Math.min(1, s + satDelta)), Math.max(0, Math.min(1, l + delta)));
}

/** WCAG relative luminance → contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number | null {
  const lum = (hex: string) => {
    const m = hex.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(m)) return null;
    const ch = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const la = lum(a);
  const lb = lum(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

function pick(role: string | undefined, palette: Record<string, string>, fallback: string): string {
  if (!role) return palette[Object.keys(palette)[0] ?? ''] ?? fallback;
  if (role.startsWith('#')) return role;
  return palette[role] ?? fallback;
}

export function resolveTheme(input: TokenInput): ResolvedTheme {
  const palette = input.brandColors ?? {};
  const keys = Object.keys(palette);
  const primary = pick(input.theme?.primary ?? keys[0], palette, FALLBACK.primary);
  const accent = pick(input.theme?.accent ?? keys[1], palette, FALLBACK.accent);
  const neutral = pick(input.theme?.neutral ?? keys[2], palette, FALLBACK.neutral);
  const highlight = pick(input.theme?.highlight ?? keys[3], palette, FALLBACK.highlight);
  const family = input.theme?.fontFamily ?? input.fonts?.display ?? input.fonts?.body;
  const fontStack = `${family ? `'${family}', ` : ''}ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  return {
    primary,
    primaryDeep: shade(primary, -0.08),
    primaryTint: shade(primary, 0.42, -0.1),
    primaryDark: shade(primary, 0.08),
    primaryDeepDark: shade(primary, 0.2),
    primaryTintDark: shade(primary, -0.28),
    accent,
    accentDeep: shade(accent, -0.08),
    neutral,
    highlight,
    fontStack,
    googleFontsHref: input.fonts?.googleFontsHref,
  };
}

/** The `:root` token block (light) + dark overrides. */
export function buildTokensCss(input: TokenInput): string {
  const t = resolveTheme(input);
  return `:root {
  /* Brand roles (from jeldon.config.ts brand.brandColors via kit.config.ts theme) */
  --primary: ${t.primary};
  --primary-deep: ${t.primaryDeep};
  --primary-tint: ${t.primaryTint};
  --accent: ${t.accent};
  --accent-deep: ${t.accentDeep};
  --neutral: ${t.neutral};
  --highlight: ${t.highlight};

  /* Surfaces & text (light) */
  --bg: #ffffff;
  --bg-alt: #f6f8f9;
  --bg-dark: #24262a;
  --fg: #23252a;
  --fg-muted: #5f6470;
  --fg-on-dark: #f5f6f7;
  --line: #e2e6ea;
  --line-strong: #c9d0d6;
  --focus: #ffb703;

  /* Type */
  --font: ${t.fontStack};
  --step--1: clamp(0.83rem, 0.8rem + 0.15vw, 0.9rem);
  --step-0: clamp(1rem, 0.96rem + 0.2vw, 1.125rem);
  --step-1: clamp(1.2rem, 1.1rem + 0.4vw, 1.4rem);
  --step-2: clamp(1.5rem, 1.3rem + 0.8vw, 1.9rem);
  --step-3: clamp(1.9rem, 1.5rem + 1.6vw, 2.6rem);
  --step-4: clamp(2.4rem, 1.7rem + 3vw, 4rem);
  --measure: 66ch;

  /* Space */
  --s-1: 0.5rem;
  --s0: 1rem;
  --s1: 1.5rem;
  --s2: 2.25rem;
  --s3: 3.5rem;
  --s4: 5.5rem;
  --gutter: clamp(1rem, 4vw, 2rem);
  --container: 72rem;

  --radius: 6px;
  --radius-lg: 12px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #1c1e21;
    --bg-alt: #24262a;
    --bg-dark: #121315;
    --fg: #f1f2f4;
    --fg-muted: #a5abb5;
    --line: #34383d;
    --line-strong: #4a4f56;
    --primary-tint: ${t.primaryTintDark};
    --primary: ${t.primaryDark};
    --primary-deep: ${t.primaryDeepDark};
  }
}
:root[data-theme='dark'] {
  --bg: #1c1e21;
  --bg-alt: #24262a;
  --bg-dark: #121315;
  --fg: #f1f2f4;
  --fg-muted: #a5abb5;
  --line: #34383d;
  --line-strong: #4a4f56;
  --primary-tint: ${t.primaryTintDark};
  --primary: ${t.primaryDark};
  --primary-deep: ${t.primaryDeepDark};
}
`;
}

/** The kit's base stylesheet. Uses only the tokens above. Ported from the
 *  Helix `global.css` with `--blue/--red` renamed to `--primary/--accent`. */
export const BASE_CSS = String.raw`
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font); font-size: var(--step-0); line-height: 1.6; font-weight: 400; }
img, svg, video, iframe { max-width: 100%; height: auto; display: block; }
a { color: var(--primary-deep); text-decoration-thickness: 1px; text-underline-offset: 0.15em; }
a:hover { color: var(--primary); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
h1, h2, h3, h4 { font-weight: 800; line-height: 1.12; letter-spacing: -0.01em; margin: 0 0 var(--s-1); text-wrap: balance; }
h1 { font-size: var(--step-4); }
h2 { font-size: var(--step-3); }
h3 { font-size: var(--step-2); }
h4 { font-size: var(--step-1); }
p { margin: 0 0 var(--s0); max-width: var(--measure); }
.lede { font-size: var(--step-1); color: var(--fg-muted); font-weight: 600; }
.muted { color: var(--fg-muted); }
small { font-size: var(--step--1); }
hr { border: 0; border-top: 1px solid var(--line); margin: var(--s2) 0; }

.container { width: min(100% - 2 * var(--gutter), var(--container)); margin-inline: auto; }
.section { padding-block: var(--s3); }
.section--tight { padding-block: var(--s2); }
.section--alt { background: var(--bg-alt); }
.section--dark { background: var(--bg-dark); color: var(--fg-on-dark); }
.section--dark a { color: var(--primary-deep); filter: brightness(1.6); }
.section-head { max-width: var(--measure); margin-bottom: var(--s2); }
.grid { display: grid; gap: var(--s1); }
.grid--2 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
.grid--3 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
.split { display: grid; gap: var(--s2); align-items: start; }
@media (min-width: 52rem) { .split { grid-template-columns: 1.1fr 0.9fr; } .split--rev > :first-child { order: 2; } }
.stack > * + * { margin-top: var(--s0); }

.btn { display: inline-flex; align-items: center; gap: 0.5em; padding: 0.75em 1.35em; border-radius: 999px; font-weight: 800; font-size: var(--step-0); line-height: 1; text-decoration: none; border: 2px solid transparent; cursor: pointer; font-family: inherit; transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease; }
.btn--primary { background: var(--accent); color: #fff; }
.btn--primary:hover { background: var(--accent-deep); color: #fff; }
.btn--blue, .btn--secondary { background: var(--primary); color: #fff; }
.btn--blue:hover, .btn--secondary:hover { background: var(--primary-deep); color: #fff; }
.btn--ghost { background: transparent; color: var(--fg); border-color: var(--line-strong); }
.btn--ghost:hover { border-color: var(--fg); color: var(--fg); }
.section--dark .btn--ghost { color: var(--fg-on-dark); border-color: rgba(255, 255, 255, 0.4); }
.btn--lg { font-size: var(--step-1); padding: 0.8em 1.6em; }
.btn-row { display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s0); align-items: center; }

.service-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; border-top: 1px solid var(--line); }
.service-row { display: grid; gap: var(--s-1) var(--s1); padding: var(--s1) 0; border-bottom: 1px solid var(--line); grid-template-columns: 1fr; }
@media (min-width: 52rem) { .service-row { grid-template-columns: 14rem 1fr auto; align-items: center; } }
.service-row h3 { margin: 0; font-size: var(--step-1); }
.service-row h3 a { color: inherit; text-decoration: none; }
.service-row h3 a:hover { color: var(--primary); }
.service-row p { margin: 0; color: var(--fg-muted); }
.service-row .who { font-size: var(--step--1); font-weight: 700; color: var(--primary-deep); }

.card { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: var(--s1); }
.card--featured { border: 2px solid var(--primary); }
.price { font-size: var(--step-3); font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
.price small { font-size: var(--step--1); font-weight: 600; color: var(--fg-muted); letter-spacing: 0; }

.person { display: grid; grid-template-columns: 5rem 1fr; gap: var(--s0); align-items: start; }
.person img, .person .avatar { width: 5rem; height: 5rem; border-radius: 50%; object-fit: cover; background: var(--primary-tint); display: grid; place-items: center; font-weight: 800; color: var(--primary-deep); font-size: var(--step-1); }
.person h3 { font-size: var(--step-1); margin-bottom: 0.15em; }
.person .role { color: var(--fg-muted); font-weight: 700; font-size: var(--step--1); margin-bottom: var(--s-1); }

.faq details { border-top: 1px solid var(--line); padding: var(--s0) 0; }
.faq details:last-child { border-bottom: 1px solid var(--line); }
.faq summary { cursor: pointer; font-weight: 800; font-size: var(--step-1); list-style: none; display: flex; justify-content: space-between; gap: var(--s0); align-items: center; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after { content: '+'; font-weight: 400; color: var(--primary); font-size: var(--step-2); line-height: 1; }
.faq details[open] summary::after { content: '–'; }
.faq details p { margin-top: var(--s-1); }

.form { display: grid; gap: var(--s0); max-width: 34rem; }
.field { display: grid; gap: 0.35rem; }
.field label { font-weight: 700; }
.field input, .field select, .field textarea { font: inherit; padding: 0.7em 0.85em; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--bg); color: var(--fg); width: 100%; }
.field textarea { min-height: 8rem; resize: vertical; }
.field .hint { font-size: var(--step--1); color: var(--fg-muted); }
.form-note { font-size: var(--step--1); color: var(--fg-muted); }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }

.notice { border-left: 4px solid var(--primary); background: var(--primary-tint); padding: var(--s0) var(--s1); border-radius: 0 var(--radius) var(--radius) 0; margin: var(--s1) 0; }
.notice--warn { border-color: var(--accent); background: #fdecec; color: #3a1b1b; }

.prose { max-width: var(--measure); }
.prose h2 { font-size: var(--step-2); margin-top: var(--s2); }
.prose h3 { font-size: var(--step-1); margin-top: var(--s1); }
.prose ul, .prose ol { padding-left: 1.4em; margin: 0 0 var(--s0); }
.prose li + li { margin-top: 0.3em; }
.prose blockquote { margin: var(--s1) 0; padding: var(--s-1) var(--s1); border-left: 4px solid var(--primary); color: var(--fg-muted); font-weight: 600; }
.prose img { border-radius: var(--radius-lg); margin: var(--s1) 0; }
.prose table { border-collapse: collapse; width: 100%; margin: var(--s1) 0; font-size: var(--step--1); }
.prose th, .prose td { border: 1px solid var(--line); padding: 0.5em 0.7em; text-align: left; }
.prose code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; background: var(--bg-alt); padding: 0.1em 0.35em; border-radius: 4px; }

.article-meta { color: var(--fg-muted); font-weight: 600; font-size: var(--step--1); display: flex; flex-wrap: wrap; gap: 0.25em 0.9em; }
.post-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s1); }
.post-list li { border-top: 1px solid var(--line); padding-top: var(--s0); }
.post-list h3 { font-size: var(--step-1); margin-bottom: 0.25em; }
.post-list h3 a { color: inherit; text-decoration: none; }
.post-list h3 a:hover { color: var(--primary); }
.tag { display: inline-block; font-size: var(--step--1); font-weight: 700; color: var(--primary-deep); background: var(--primary-tint); padding: 0.15em 0.6em; border-radius: 999px; margin-right: 0.3em; }

.visually-hidden { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip-link { position: absolute; left: 1rem; top: -4rem; background: var(--fg); color: var(--bg); padding: 0.5em 1em; border-radius: var(--radius); z-index: 100; }
.skip-link:focus { top: 1rem; }
.center { text-align: center; }
.center p { margin-inline: auto; }
`;

/** Tokens + base, ready for an inline `<style>`. */
export function buildGlobalCss(input: TokenInput): string {
  return buildTokensCss(input) + BASE_CSS;
}
