/**
 * Per-vertical SCORING presets for the generated Domain Pack: the first-person
 * markers an expert in that vertical actually uses, and the primary-source
 * hosts their articles cite. The engine's defaults describe a clinic (they
 * were extracted from one); `jeldon init` picks one of these for the new
 * pack. Data only — the scorer never changes.
 */
import type { VerticalPreset } from './labels.js';

export interface VerticalScoringPreset {
  /** `firstPerson` GEO check `patterns` (regex sources, joined with |). */
  firstPersonPatterns: string[];
  /** `citation` GEO check `patterns`. */
  citationPatterns: string[];
  /** Reading band for the voice + SEO scorer. */
  readingBand: [number, number];
  /** Suggested `content.categories` + targets. */
  categories: Record<string, number>;
  /** Suggested `schema.orgType`. */
  orgType: string[];
  /** Human-review tag hints for `compliance.requireHumanReviewTags`. */
  reviewTags: string[];
}

const HEALTH_SOURCES =
  'pubmed\\.ncbi\\.nlm\\.nih\\.gov|doi\\.org\\/|pmid[:\\s]*\\d|PMC\\d{5,}|cdc\\.gov|who\\.int|nih\\.gov|cochranelibrary\\.com|bmj\\.com|thelancet\\.com|jamanetwork\\.com|nejm\\.org';

export const VERTICAL_SCORING: Record<VerticalPreset, VerticalScoringPreset> = {
  gym: {
    firstPersonPatterns: [
      '\\bwhen I\\b|\\bI (?:see|find|coach|tell|recommend|use|program|watch|hear|ask|start|teach)\\b|' +
        '\\bin our (?:gym|classes|programs)\\b|\\bour members\\b|' +
        '\\bwe (?:see|coach|find|use|recommend|program|start|teach|scale)\\b',
    ],
    citationPatterns: [`${HEALTH_SOURCES}|acsm\\.org|nsca\\.com|health\\.gov|apta\\.org|bjsm\\.bmj\\.com|journals\\.lww\\.com|sciencedirect\\.com|springer\\.com|wiley\\.com`],
    readingBand: [6, 9],
    categories: { guide: 80, evidence: 85, training: 80, nutrition: 80, community: 70 },
    orgType: ['Organization', 'LocalBusiness', 'HealthClub'],
    reviewTags: ['back-pain', 'knee-pain', 'shoulder-health', 'menopause', 'bone-density'],
  },
  clinic: {
    firstPersonPatterns: [
      '\\bwhen I\\b|\\bI (?:see|find|treat|tell|recommend|use|approach|look|hear|order|refer)\\b|' +
        '\\bin our (?:clinic|practice|office)\\b|\\bour patients\\b|\\bwe (?:see|treat|find|use|recommend|order|refer)\\b',
    ],
    citationPatterns: [HEALTH_SOURCES],
    readingBand: [6, 9],
    categories: { conditions: 85, care: 85, evidence: 85, guide: 80, news: 70 },
    orgType: ['Organization', 'LocalBusiness', 'MedicalBusiness'],
    reviewTags: ['diagnosis', 'medication', 'surgery', 'pregnancy', 'pediatrics'],
  },
  studio: {
    firstPersonPatterns: [
      '\\bwhen I\\b|\\bI (?:see|find|teach|tell|recommend|use|cue|watch|hear|ask|start)\\b|' +
        '\\bin our (?:studio|classes)\\b|\\bour students\\b|\\bwe (?:see|teach|find|use|recommend|start|cue)\\b',
    ],
    citationPatterns: [`${HEALTH_SOURCES}|acsm\\.org|nsca\\.com|health\\.gov`],
    readingBand: [6, 9],
    categories: { guide: 80, practice: 80, evidence: 85, community: 70 },
    orgType: ['Organization', 'LocalBusiness', 'ExerciseGym'],
    reviewTags: ['injury', 'pregnancy', 'pain'],
  },
  shop: {
    firstPersonPatterns: [
      '\\bwhen I\\b|\\bI (?:see|find|fix|tell|recommend|use|build|test|hear|ask|fit)\\b|' +
        '\\bin our (?:shop|store|workshop)\\b|\\bour customers\\b|\\bwe (?:see|fix|find|use|recommend|build|stock|test|fit)\\b',
    ],
    citationPatterns: ['doi\\.org\\/|\\.gov\\/|manufacturer|spec sheet|iso\\.org|astm\\.org|consumerreports\\.org|nhtsa\\.gov|cpsc\\.gov'],
    readingBand: [6, 9],
    categories: { guide: 80, howto: 80, review: 75, news: 70 },
    orgType: ['Organization', 'LocalBusiness', 'Store'],
    reviewTags: ['safety', 'recall'],
  },
  generic: {
    firstPersonPatterns: [
      '\\bwhen I\\b|\\bI (?:see|find|tell|recommend|use|hear|ask|start)\\b|\\bin our (?:business|shop|office|work)\\b|\\bour (?:clients|customers)\\b|\\bwe (?:see|find|use|recommend|start)\\b',
    ],
    citationPatterns: ['doi\\.org\\/|\\.gov\\/|\\.edu\\/|iso\\.org'],
    readingBand: [6, 9],
    categories: { guide: 80, evidence: 85, opinion: 72 },
    orgType: ['Organization', 'LocalBusiness'],
    reviewTags: [],
  },
};
