/**
 * Google Search Console CSV export reader.
 *
 * The owner-friendly, no-API path: Search Console → Performance → Export →
 * Download CSV gives a zip with Queries.csv, Pages.csv, Dates.csv, Devices.csv,
 * Countries.csv. The owner drops the files in a folder; this module reads
 * them. Ported from Helix `scripts/traffic-report.mjs` and made engine-worthy:
 * pure parsing + aggregation (no fs, no console) so a Worker route, the CLI,
 * and a kit script share one implementation.
 */

export interface SearchConsoleRow {
  /** The first column: the query, page URL, date, device or country. */
  key: string;
  clicks: number;
  impressions: number;
  /** Click-through rate as a fraction (0.034 for "3.4%"). */
  ctr: number;
  position: number;
}

export type SearchConsoleTable = 'queries' | 'pages' | 'dates' | 'devices' | 'countries' | 'unknown';

export interface SearchConsoleExport {
  table: SearchConsoleTable;
  /** The header label of the key column ("Top queries", "Top pages", "Date"…). */
  keyLabel: string;
  rows: SearchConsoleRow[];
  totals: { clicks: number; impressions: number };
}

/** RFC-4180-ish CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

const num = (v: string | undefined): number => Number(String(v ?? '').replace(/[%,]/g, '')) || 0;

/** Guess which export table a CSV is from its header (or a filename hint). */
export function classifySearchConsoleTable(keyLabel: string, filename?: string): SearchConsoleTable {
  const k = `${filename ?? ''} ${keyLabel}`.toLowerCase();
  if (/quer/.test(k)) return 'queries';
  if (/page/.test(k)) return 'pages';
  if (/date/.test(k)) return 'dates';
  if (/device/.test(k)) return 'devices';
  if (/countr/.test(k)) return 'countries';
  return 'unknown';
}

/** Parse one Search Console CSV export into typed rows. */
export function parseSearchConsoleExport(text: string, filename?: string): SearchConsoleExport {
  const [head, ...body] = parseCsv(text);
  if (!head) return { table: 'unknown', keyLabel: '', rows: [], totals: { clicks: 0, impressions: 0 } };
  const headers = head.map((h) => h.trim().toLowerCase());
  const col = (name: RegExp) => headers.findIndex((h) => name.test(h));
  const iClicks = col(/^clicks$/);
  const iImp = col(/^impressions$/);
  const iCtr = col(/^ctr$/);
  const iPos = col(/^position$/);
  const keyLabel = head[0]?.trim() ?? '';
  const rows: SearchConsoleRow[] = body.map((r) => ({
    key: (r[0] ?? '').trim(),
    clicks: num(r[iClicks]),
    impressions: num(r[iImp]),
    ctr: iCtr >= 0 ? num(r[iCtr]) / (String(r[iCtr] ?? '').includes('%') ? 100 : 1) : 0,
    position: num(r[iPos]),
  }));
  return {
    table: classifySearchConsoleTable(keyLabel, filename),
    keyLabel,
    rows,
    totals: {
      clicks: rows.reduce((a, r) => a + r.clicks, 0),
      impressions: rows.reduce((a, r) => a + r.impressions, 0),
    },
  };
}

export interface SearchConsoleOpportunity extends SearchConsoleRow {
  /** Why it is an opportunity. */
  reason: 'weak-position' | 'weak-ctr';
}

/** Rows with real impressions but a weak position or CTR — the "one good
 *  article or a stronger title could move this" list. Thresholds are knobs. */
export function searchConsoleOpportunities(
  exp: SearchConsoleExport,
  opts: { minImpressions?: number; weakPositionAbove?: number; weakCtrBelow?: number; limit?: number } = {},
): SearchConsoleOpportunity[] {
  const minImp = opts.minImpressions ?? 20;
  const posAbove = opts.weakPositionAbove ?? 8;
  const ctrBelow = opts.weakCtrBelow ?? 0.02;
  return exp.rows
    .filter((r) => r.impressions >= minImp && (r.position > posAbove || r.ctr < ctrBelow))
    .map((r) => ({ ...r, reason: r.position > posAbove ? ('weak-position' as const) : ('weak-ctr' as const) }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, opts.limit ?? 10);
}

/** Top rows by clicks, then impressions. */
export function searchConsoleTop(exp: SearchConsoleExport, limit = 15): SearchConsoleRow[] {
  return [...exp.rows].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, limit);
}

/** First-vs-last-7-days click totals for a Dates export (trend at a glance). */
export function searchConsoleTrend(exp: SearchConsoleExport): { first7: number; last7: number } | null {
  if (exp.table !== 'dates' || exp.rows.length === 0) return null;
  const sorted = [...exp.rows].sort((a, b) => (a.key < b.key ? -1 : 1));
  const sum = (arr: SearchConsoleRow[]) => arr.reduce((a, r) => a + r.clicks, 0);
  return { first7: sum(sorted.slice(0, 7)), last7: sum(sorted.slice(-7)) };
}

/** Render the markdown report the agent reads (`/traffic`). */
export function renderSearchConsoleReport(exports: Array<{ file: string; data: SearchConsoleExport }>, today = new Date().toISOString().slice(0, 10)): string {
  const lines = [`# Search Console report — generated ${today}`, ''];
  for (const { file, data } of exports) {
    if (!data.rows.length) continue;
    lines.push(`## ${file}`, `- Rows: ${data.rows.length} · Clicks: ${data.totals.clicks} · Impressions: ${data.totals.impressions}`);
    if (data.table === 'queries' || data.table === 'pages') {
      lines.push('', `| ${data.keyLabel} | Clicks | Impr. | CTR | Pos. |`, '|---|---|---|---|---|');
      for (const r of searchConsoleTop(data)) lines.push(`| ${r.key} | ${r.clicks} | ${r.impressions} | ${(r.ctr * 100).toFixed(1)}% | ${r.position.toFixed(1)} |`);
      const opp = searchConsoleOpportunities(data);
      if (opp.length) {
        lines.push('', '**Opportunities (high impressions, weak position/CTR):**');
        for (const r of opp) lines.push(`- ${r.key} — ${r.impressions} impressions, position ${r.position.toFixed(1)}, CTR ${(r.ctr * 100).toFixed(1)}%`);
      }
    }
    const trend = searchConsoleTrend(data);
    if (trend) lines.push(`- First 7 days clicks: ${trend.first7} · Last 7 days clicks: ${trend.last7}`);
    lines.push('');
  }
  return lines.join('\n');
}
