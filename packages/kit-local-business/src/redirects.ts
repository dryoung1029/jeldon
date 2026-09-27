import type { KitRoutes } from './kit-config.js';

/**
 * Redirect generator. Given the OLD site's URL list (its sitemap) and the new
 * page map, produce Cloudflare `_redirects` lines and the `OLD-URLS.md`
 * table — from ONE data set, so they cannot drift. Explicit `overrides` win;
 * then keyword heuristics (an old path containing "pricing" → pricing);
 * anything unmatched goes to the fallback (home) and is listed under
 * "review these" so the agent asks rather than guesses.
 */
export interface RedirectRule {
  from: string;
  to: string;
  status?: 301 | 302;
  /** How the mapping was decided. */
  via: 'override' | 'heuristic' | 'fallback' | 'same';
}

export interface RedirectPlan {
  rules: RedirectRule[];
  /** Old paths that landed on the fallback — worth a human look. */
  unmatched: string[];
}

export interface RedirectOptions {
  routes: KitRoutes;
  /** Old path (or glob with trailing *) → new path. */
  overrides?: Record<string, string>;
  /** New paths that exist so a same-path old URL needs no redirect. */
  newPaths?: string[];
  /** Old service slugs → new service slugs under routes.services. */
  serviceSlugMap?: Record<string, string>;
  fallback?: string;
}

const HEURISTICS: Array<[RegExp, keyof KitRoutes]> = [
  [/pric|membership|cost|fees|rates|plans|hsa|insurance/i, 'pricing'],
  [/schedule|calendar|timetable|hours|class-times/i, 'schedule'],
  [/contact|location|directions|visit|find-us|appointment/i, 'contact'],
  [/coach|trainer|staff|team|provider|doctor|instructor|our-people|bio|careers|jobs/i, 'team'],
  [/blog|news|article|post|recipe|nutrition|event|challenge|resources/i, 'blog'],
  [/about|story|mission|partner|why-us/i, 'about'],
  [/faq|question/i, 'faq'],
  [/privacy/i, 'privacy'],
  [/terms/i, 'terms'],
  [/member|cancel|pause|freeze|login|portal|patient-portal/i, 'members'],
  [/free|trial|intro|get-started|start|new-patient|book|sign-?up|join/i, 'primaryCta'],
  [/program|service|class|treatment|care|offering/i, 'services'],
];

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return url.replace(/\/+$/, '') || '/';
  }
}

export function planRedirects(oldUrls: string[], opts: RedirectOptions): RedirectPlan {
  const fallback = opts.fallback ?? '/';
  const newPaths = new Set((opts.newPaths ?? []).map((p) => p.replace(/\/+$/, '') || '/'));
  const rules: RedirectRule[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const raw of oldUrls) {
    const from = pathOf(raw);
    if (from === '/' || seen.has(from)) continue;
    seen.add(from);

    const override = opts.overrides?.[from] ?? opts.overrides?.[`${from}/`];
    if (override) {
      rules.push({ from, to: override, status: 301, via: 'override' });
      continue;
    }
    if (newPaths.has(from)) {
      rules.push({ from, to: `${from}/`, via: 'same' });
      continue;
    }
    const seg = from.split('/').filter(Boolean);
    const last = seg[seg.length - 1] ?? '';
    if (opts.serviceSlugMap && seg.length >= 2 && opts.serviceSlugMap[last]) {
      rules.push({ from, to: `${opts.routes.services}${opts.serviceSlugMap[last]}/`, status: 301, via: 'heuristic' });
      continue;
    }
    const hit = HEURISTICS.find(([re]) => re.test(from));
    if (hit) {
      rules.push({ from, to: opts.routes[hit[1]], status: 301, via: 'heuristic' });
      continue;
    }
    rules.push({ from, to: fallback, status: 301, via: 'fallback' });
    unmatched.push(from);
  }
  return { rules, unmatched };
}

/** Cloudflare `_redirects` file contents. `same` rules are omitted (nothing to do). */
export function renderRedirectsFile(plan: RedirectPlan): string {
  const lines = plan.rules.filter((r) => r.via !== 'same' && r.from !== r.to.replace(/\/$/, ''))
    .map((r) => `${r.from} ${r.to} ${r.status ?? 301}`);
  return lines.join('\n') + (lines.length ? '\n' : '');
}

/** The human table for docs/OLD-URLS.md, generated from the same plan. */
export function renderOldUrlsDoc(plan: RedirectPlan, opts: { oldHost: string; today?: string; notes?: string[] }): string {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const byTarget = new Map<string, string[]>();
  for (const r of plan.rules) {
    if (r.via === 'same') continue;
    const list = byTarget.get(r.to) ?? [];
    list.push(r.from);
    byTarget.set(r.to, list);
  }
  const rows = [...byTarget.entries()].map(([to, froms]) => `| ${froms.join(', ')} | ${to} |`);
  const out = [
    `# Old site URLs (${opts.oldHost}) → new pages`,
    '',
    `Every address the old site's sitemap listed on ${today}, and where it goes now.`,
    '`public/_redirects` implements this table; both are generated from the same',
    'data by `jeldon init` (re-run it, or add a line to both by hand when a page moves).',
    '',
    '| Old | New |',
    '|---|---|',
    ...rows,
  ];
  if (plan.unmatched.length) {
    out.push('', '## Review these', '', 'No page on the new site obviously matches; they redirect to the home page until someone decides:', '');
    for (const u of plan.unmatched) out.push(`- \`${u}\``);
  }
  if (opts.notes?.length) out.push('', '## Notes', '', ...opts.notes.map((n) => `- ${n}`));
  return out.join('\n') + '\n';
}
