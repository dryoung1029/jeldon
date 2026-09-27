import type { PsiResult } from './types.js';

/**
 * PageSpeed Insights (keyless; key optional). Best of two runs, mobile +
 * desktop. Keyless quota is small and 429s are common — a failure is reported
 * as `error` and the dimension becomes `unmeasured`/tie, never a silent zero.
 */
export async function runPsi(
  url: string,
  strategy: 'mobile' | 'desktop',
  opts: { apiKey?: string; fetchImpl?: typeof fetch; runs?: number } = {},
): Promise<PsiResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const key = opts.apiKey ? `&key=${encodeURIComponent(opts.apiKey)}` : '';
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance${key}`;
  let best: PsiResult | null = null;
  let lastErr = '';
  for (let i = 0; i < (opts.runs ?? 2); i++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 70_000);
      const res = await fetchImpl(api, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) {
        lastErr = `PSI ${strategy} ${res.status}`;
        if (res.status === 429) await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      const data = (await res.json()) as { lighthouseResult?: { categories?: Record<string, { score?: number }>; audits?: Record<string, { numericValue?: number }> } };
      const cat = data.lighthouseResult?.categories ?? {};
      const audits = data.lighthouseResult?.audits ?? {};
      const r: PsiResult = {
        performance: cat.performance?.score != null ? Math.round(cat.performance.score * 100) : null,
        lcp: audits['largest-contentful-paint']?.numericValue != null ? Math.round(audits['largest-contentful-paint']!.numericValue! / 10) / 100 : null,
        cls: audits['cumulative-layout-shift']?.numericValue ?? null,
        tbt: audits['total-blocking-time']?.numericValue ?? null,
        totalBytes: audits['total-byte-weight']?.numericValue ?? null,
      };
      if (!best || (r.performance ?? -1) > (best.performance ?? -1)) best = r;
    } catch (err) {
      lastErr = `PSI ${strategy}: ${(err as Error).message}`;
    }
  }
  return best ?? { performance: null, lcp: null, cls: null, tbt: null, totalBytes: null, error: lastErr || 'PSI unavailable' };
}
