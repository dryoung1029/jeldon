import { compare, DIMENSION_ORDER } from './dimensions.js';
import { DIMENSION_LABELS, type Baseline, type Measurement, type Scorecard, type SiteSnapshot } from './types.js';

export function buildScorecard(args: { oldUrl: string | null; newUrl: string; oldMeasurements: Measurement[] | null; newMeasurements: Measurement[]; generatedAt?: string }): Scorecard {
  const rows = DIMENSION_ORDER.map((id) => {
    const o = args.oldMeasurements?.find((m) => m.id === id) ?? null;
    const n = args.newMeasurements.find((m) => m.id === id)!;
    const { verdict, why } = compare(o, n);
    return { id, label: DIMENSION_LABELS[id], old: o, new: n, verdict, why };
  });
  const wins = rows.filter((r) => r.verdict === 'win');
  const behind = rows.filter((r) => r.verdict === 'behind');
  const ties = rows.filter((r) => r.verdict === 'tie');
  const unmeasured = rows.filter((r) => r.verdict === 'unmeasured');

  // Three biggest wins, in plain words the owner can quote.
  const biggestWins = wins
    .map((r) => ({ r, delta: (r.new.score ?? 0) - (r.old?.score ?? 0) }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3)
    .map(({ r }) => plainWin(r.id, r.old, r.new));

  const fixList: string[] = [];
  for (const r of rows) {
    if (r.verdict === 'behind') {
      const lines = r.new.issues.length ? r.new.issues : [behindHint(r.id, r.old, r.new)];
      fixList.push(...lines.map((i) => `[${r.label} — BEHIND] ${i}`));
    }
    else if (r.verdict === 'tie' && r.new.issues.length) fixList.push(...r.new.issues.slice(0, 3).map((i) => `[${r.label} — tie, could win] ${i}`));
  }
  return {
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    oldUrl: args.oldUrl,
    newUrl: args.newUrl,
    rows,
    wins: wins.length,
    ties: ties.length,
    behind: behind.length,
    unmeasured: unmeasured.length,
    passes: behind.length === 0,
    biggestWins,
    fixList,
  };
}

/** When a dimension is behind but the new site has no flagged issue of its
 *  own, say what the old site has more of — that IS the fix list. */
function behindHint(id: string, o: Measurement | null, n: Measurement): string {
  const d = n.details;
  const od = o?.details ?? {};
  if (id === 'content-depth') {
    const parts: string[] = [];
    if (Number(od.indexable) > Number(d.indexable)) parts.push(`the old site has ${od.indexable} unique indexable pages vs ${d.indexable} — add real pages (or confirm the missing ones were placeholders/duplicates)`);
    if (Number(od.homeWords) > Number(d.homeWords)) parts.push(`old home page ${od.homeWords} words vs ${d.homeWords} — expand the home copy with real detail (pillars, steps, FAQ answers)`);
    if (Number(od.goodPosts) > Number(d.goodPosts)) parts.push(`old site has ${od.goodPosts} sourced post(s) ≥600 words vs ${d.goodPosts}`);
    if (Number(d.goodPosts) === 0) parts.push('publish the first sourced article (a draft in src/content/articles counts once /publish flips it)');
    if (Number(od.faqs) > Number(d.faqs)) parts.push(`old site shows ${od.faqs} FAQ entries vs ${d.faqs} — add FAQs (they also emit FAQPage schema)`);
    return parts.join('; ') || `${n.value} vs ${o?.value ?? '—'}`;
  }
  return `${n.value} vs ${o?.value ?? '—'}`;
}

function plainWin(id: string, o: Measurement | null, n: Measurement): string {
  const d = n.details;
  const od = o?.details ?? {};
  switch (id) {
    case 'speed':
      return `The new site scores ${d.avgPerformance}/100 on speed versus ${od.avgPerformance ?? '—'} before.`;
    case 'search-hygiene':
      return `${d.passed} of ${d.total} search basics are right on the new site (titles, descriptions, headings, canonicals), up from ${od.passed ?? '—'} of ${od.total ?? '—'}.`;
    case 'duplicate-urls':
      return `The old site had ${od.groups ?? '—'} pages answering the same question at two addresses; the new one has ${d.groups}.`;
    case 'structured-data':
      return `Search engines and AI assistants can now read ${d.types} from the pages, instead of ${od.types || 'nothing'}.`;
    case 'citability':
      return `The home page's AI-citation readiness went from ${od.home ?? '—'} to ${d.home} out of 100.`;
    case 'content-depth':
      return `The new site has ${d.indexable} real pages, ${d.homeWords} words of home-page copy and ${d.goodPosts} sourced article(s), versus ${od.indexable ?? '—'} pages and ${od.homeWords ?? '—'} words before.`;
    case 'conversion-path':
      return `Booking is ${d.clicksToBook} click(s) from the home page with a clear call-to-action above the fold and ${d.deadLinks} dead links (was ${od.clicksToBook ?? '—'} click(s), ${od.deadLinks ?? '—'} dead links).`;
    case 'accessibility':
      return `${d.passed} of ${d.total} accessibility checks pass (alt text, form labels, skip link, focus styles, contrast), up from ${od.passed ?? '—'}.`;
    case 'honesty':
      return `No stale promotions, placeholder text, or unsourced statistics on the new site (the old one had ${(Number(od.unsourcedStats) || 0) + String(od.expiredPromos ?? '').split(',').filter(Boolean).length + String(od.placeholders ?? '').split(',').filter(Boolean).length + String(od.staleCopyright ?? '').split(',').filter(Boolean).length} such issue(s)).`;
    case 'local':
      return `Address, phone, map and hours are all marked up for local search (${d.nap ? 'NAP in structured data' : ''}, ${d.tel ? 'tap-to-call' : ''}).`;
    default:
      return `${DIMENSION_LABELS[id as keyof typeof DIMENSION_LABELS]}: ${n.value}`;
  }
}

const ICON: Record<string, string> = { win: '✅ win', tie: '➖ tie', behind: '❌ behind', unmeasured: '⬜ unmeasured' };

export function renderScorecardMarkdown(card: Scorecard): string {
  const date = card.generatedAt.slice(0, 10);
  const lines = [
    `# Benchmark scorecard — ${date}`,
    '',
    `Old: ${card.oldUrl ?? '(baseline not available)'}  `,
    `New: ${card.newUrl}`,
    '',
    `**${card.wins} win · ${card.ties} tie · ${card.behind} behind · ${card.unmeasured} unmeasured — ${card.passes ? 'LAUNCH GATE PASSES' : 'LAUNCH BLOCKED'}**`,
    '',
    '| Dimension | Old | New | Verdict |',
    '|---|---|---|---|',
    ...card.rows.map((r) => `| ${r.label} | ${r.old?.value ?? '—'} | ${r.new.value} | ${ICON[r.verdict]} (${r.why}) |`),
    '',
  ];
  if (card.biggestWins.length) {
    lines.push('## Three biggest wins (in plain words)', '', ...card.biggestWins.map((w) => `- ${w}`), '');
  }
  if (card.fixList.length) {
    lines.push('## Fix list', '', ...card.fixList.map((f) => `- ${f}`), '');
  } else {
    lines.push('## Fix list', '', '- Nothing behind or tied-with-issues. Keep the scorecard; the trend matters.', '');
  }
  return lines.join('\n');
}

export function measurementsToBaseline(snapshot: SiteSnapshot, measurements: Measurement[]): Baseline {
  const { pages, home: _h, servicePage: _s, ...rest } = snapshot;
  return {
    url: snapshot.url,
    storedAt: new Date().toISOString(),
    measurements,
    snapshot: { ...rest, pages: pages.map(({ html: _html, ...p }) => p) },
  };
}
