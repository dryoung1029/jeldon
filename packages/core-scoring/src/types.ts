export type ScoreStatus = 'good' | 'meh' | 'bad';

export interface ScoreCheck {
  status: ScoreStatus;
  label: string;
  value: string;
}

export interface ScoreResult {
  score: number;
  checks: ScoreCheck[];
  badCount: number;
  mehCount: number;
}

export interface ScorableInput {
  title: string;
  excerpt: string;
  tags: string[];
  body: string;
  slug: string;
  heroImage?: string;
  heroImageAlt?: string;
}
