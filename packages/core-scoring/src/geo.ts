import { defaultGeoConfig, type GeoCheckDef, type GeoConfig } from '@jeldon/config';
import type { ScorableInput, ScoreCheck, ScoreResult, ScoreStatus } from './types.js';

/**
 * GEO — Generative Engine Optimization. Per-article "citability" score for
 * answer engines (ChatGPT, Claude, Perplexity, Gemini, Google AIO). Based on
 * the patterns the Princeton GEO 2024 paper (Aggarwal et al.) found to lift
 * citation rate. Ported from Body of Health `calculateGeo`, with every regex,
 * threshold and weight lifted into `GeoConfig` so the engine is domain-agnostic.
 */
export function calculateGeo(input: ScorableInput, cfg: GeoConfig = defaultGeoConfig): ScoreResult {
  const cleaned = input.body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~>]/g, ' ');

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const checks: ScoreCheck[] = [];

  if (!wordCount) {
    return { score: 0, checks: [{ status: 'bad', label: 'GEO', value: 'empty body' }], badCount: 1, mehCount: 0 };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const def of cfg.checks) {
    const { metric, display } = evaluate(def, cleaned, input.body, wordCount);
    const [good, meh] = def.thresholds;
    const status: ScoreStatus = metric >= good ? 'good' : metric >= meh ? 'meh' : 'bad';
    checks.push({ status, label: def.label, value: display });
    const w = def.weight;
    weightedSum += (status === 'good' ? 1 : status === 'meh' ? 0.5 : 0) * w;
    totalWeight += w;
  }

  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
  return {
    score,
    checks,
    badCount: checks.filter((c) => c.status === 'bad').length,
    mehCount: checks.filter((c) => c.status === 'meh').length,
  };
}

function evaluate(def: GeoCheckDef, cleaned: string, body: string, wordCount: number): { metric: number; display: string } {
  if (def.kind === 'questionH2') {
    const h2s = body.match(/^##\s+(.+)$/gm) || [];
    const starters = (def.patterns ?? []).map((s) => s.toLowerCase());
    const startersRe = starters.length ? new RegExp(`^(${starters.join('|')})\\b`, 'i') : null;
    const count = h2s.filter((h) => {
      const text = h.replace(/^##\s+/, '').trim();
      return /\?\s*$/.test(text) || (startersRe ? startersRe.test(text) : false);
    }).length;
    return { metric: count, display: String(count) };
  }

  const target = def.target === 'body' ? body : cleaned;
  const re = new RegExp((def.patterns ?? []).join('|'), def.flags ?? 'g');
  const matches = target.match(re) || [];

  if (def.kind === 'regexPer1k') {
    const density = (matches.length / wordCount) * 1000;
    return { metric: density, display: `${density.toFixed(1)}/1k words` };
  }
  return { metric: matches.length, display: String(matches.length) };
}
