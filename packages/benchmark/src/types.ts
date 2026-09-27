export type Verdict = 'win' | 'tie' | 'behind' | 'unmeasured';

export type DimensionId =
  | 'speed' | 'search-hygiene' | 'duplicate-urls' | 'structured-data' | 'citability'
  | 'content-depth' | 'conversion-path' | 'accessibility' | 'honesty' | 'local';

export const DIMENSION_IDS: DimensionId[] = [
  'speed', 'search-hygiene', 'duplicate-urls', 'structured-data', 'citability',
  'content-depth', 'conversion-path', 'accessibility', 'honesty', 'local',
];

export const DIMENSION_LABELS: Record<DimensionId, string> = {
  speed: 'Speed',
  'search-hygiene': 'Search hygiene',
  'duplicate-urls': 'Duplicate-intent URLs',
  'structured-data': 'Structured data',
  citability: 'Citability (GEO)',
  'content-depth': 'Content depth',
  'conversion-path': 'Conversion path',
  accessibility: 'Accessibility',
  honesty: 'Honesty',
  local: 'Local',
};

/** One site's measurement on one dimension. `score` is comparable across
 *  sites (higher is better, even for "lower-is-better" raw metrics — those are
 *  inverted). `value` is the human string for the table. */
export interface Measurement {
  id: DimensionId;
  score: number | null;
  value: string;
  /** Sub-facts the fix list draws on. */
  details: Record<string, string | number | boolean | null>;
  /** Problems found (each becomes a fix-list line when the verdict is not a win). */
  issues: string[];
  note?: string;
}

export interface PageFacts {
  url: string;
  path: string;
  status: number;
  bytes: number;
  title: string | null;
  description: string | null;
  h1s: string[];
  canonical: string | null;
  lang: string | null;
  viewport: boolean;
  robotsMeta: string | null;
  schemaTypes: string[];
  schemaNap: { address: boolean; telephone: boolean };
  hasFaqText: boolean;
  images: number;
  imagesWithAlt: number;
  inputs: number;
  inputsLabeled: number;
  skipLink: boolean;
  focusStyles: boolean;
  reducedMotion: boolean;
  contrast: number | null;
  wordCount: number;
  links: string[];
  hashLinks: number;
  telLink: boolean;
  mapPresent: boolean;
  copyrightYear: number | null;
  placeholderHits: string[];
  unsourcedStats: number;
  expiredPromos: string[];
  hasReferences: boolean;
  faqCount: number;
  geoScore: number;
  ctaAboveFold: boolean;
  bookingLinks: string[];
  isArticle: boolean;
  html: string;
}

export interface PsiResult {
  performance: number | null;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  totalBytes: number | null;
  error?: string;
}

export interface SiteSnapshot {
  url: string;
  origin: string;
  fetchedAt: string;
  sitemapFound: boolean;
  sitemapUrls: string[];
  robotsFound: boolean;
  pages: PageFacts[];
  home: PageFacts | null;
  servicePage: PageFacts | null;
  deadLinks: string[];
  checkedLinks: number;
  psi: { mobile: Record<string, PsiResult>; desktop: Record<string, PsiResult> } | null;
  contactTest: { status: number; ok: boolean } | null;
  errors: string[];
}

export interface DimensionRow {
  id: DimensionId;
  label: string;
  old: Measurement | null;
  new: Measurement;
  verdict: Verdict;
  /** Plain-words reason for the verdict. */
  why: string;
}

export interface Scorecard {
  generatedAt: string;
  oldUrl: string | null;
  newUrl: string;
  rows: DimensionRow[];
  wins: number;
  ties: number;
  behind: number;
  unmeasured: number;
  /** Any 'behind' → false. */
  passes: boolean;
  biggestWins: string[];
  fixList: string[];
}

export interface Baseline {
  url: string;
  storedAt: string;
  measurements: Measurement[];
  snapshot: Omit<SiteSnapshot, 'pages' | 'home' | 'servicePage'> & { pages: Array<Omit<PageFacts, 'html'>> };
}
