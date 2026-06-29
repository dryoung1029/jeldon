import { defaultGeoConfig, defaultSeoConfig, type ScoringConfig } from '@jeldon/config';
import { calculateGeo } from './geo.js';
import { calculateSeo } from './seo.js';
import type { ScorableInput, ScoreResult } from './types.js';

export { calculateSeo } from './seo.js';
export { calculateGeo } from './geo.js';
export { fleschKincaidGrade } from './reading-level.js';
export type { ScorableInput, ScoreResult, ScoreCheck, ScoreStatus } from './types.js';

/** Run both scorers with a single ScoringConfig (e.g. `pack.scoring`). */
export function scoreArticle(
  input: ScorableInput,
  scoring?: ScoringConfig,
): { seo: ScoreResult; geo: ScoreResult } {
  return {
    seo: calculateSeo(input, scoring?.seo ?? defaultSeoConfig),
    geo: calculateGeo(input, scoring?.geo ?? defaultGeoConfig),
  };
}
