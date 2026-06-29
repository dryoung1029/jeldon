import { defaultSeoConfig, type SeoConfig } from '@jeldon/config';
import { fleschKincaidGrade } from './reading-level.js';
import type { ScorableInput, ScoreCheck, ScoreResult, ScoreStatus } from './types.js';

/**
 * Classical SEO health score. Ported from Body of Health `calculateSeo`, with
 * every band, prefix list and trigger lifted into `SeoConfig`. Unweighted mean
 * of per-check status (good=1, meh=0.5, bad=0).
 */
export function calculateSeo(input: ScorableInput, cfg: SeoConfig = defaultSeoConfig): ScoreResult {
  const { title, excerpt, tags, body, slug, heroImage, heroImageAlt } = input;

  const wordCount = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean).length;
  const h2Count = (body.match(/^##\s+/gm) || []).length;
  const links = body.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
  const internalLinkRe = new RegExp(`\\]\\(\\/(${cfg.internalLinkPrefixes.join('|')})`);
  const internalLinks = links.filter((l) => internalLinkRe.test(l)).length;
  const externalLinks = links.length - internalLinks;
  const images = body.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [];
  const imagesNoAlt = images.filter((img) => /^!\[\s*\]/.test(img)).length;

  const checks: ScoreCheck[] = [];
  const push = (status: ScoreStatus, label: string, value: string) => checks.push({ status, label, value });
  const within = (n: number, [lo, hi]: [number, number]) => n >= lo && n <= hi;

  const tl = title.length;
  push(within(tl, cfg.title.good) ? 'good' : tl > 0 && tl <= cfg.title.mehMax ? 'meh' : 'bad', 'Title length', `${tl} chars`);

  const el = excerpt.length;
  push(within(el, cfg.excerpt.good) ? 'good' : within(el, cfg.excerpt.meh) ? 'meh' : 'bad', 'Excerpt length', `${el} chars`);

  const sl = slug.length;
  const slugClean = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
  push(slugClean && sl <= cfg.slugMaxLen ? 'good' : slugClean ? 'meh' : 'bad', 'Slug', `${sl} chars`);

  push(within(wordCount, cfg.wordCount.good) ? 'good' : wordCount >= cfg.wordCount.mehMin ? 'meh' : 'bad', 'Word count', String(wordCount));

  const bodyChars = body.length;
  push(bodyChars <= cfg.bodyChars.good ? 'good' : bodyChars <= cfg.bodyChars.meh ? 'meh' : 'bad', 'Body chars (TTS)', `${bodyChars}`);

  push(within(h2Count, cfg.h2.good) ? 'good' : within(h2Count, cfg.h2.meh) ? 'meh' : 'bad', 'H2 sections', String(h2Count));

  push(internalLinks >= cfg.internalLinks.good ? 'good' : internalLinks >= cfg.internalLinks.meh ? 'meh' : 'bad', 'Internal links', String(internalLinks));

  push('good', 'External links', String(externalLinks));

  push(within(tags.length, cfg.tags.good) ? 'good' : tags.length >= cfg.tags.mehMin ? 'meh' : 'bad', 'Tags', String(tags.length));

  if (images.length > 0) {
    push(imagesNoAlt === 0 ? 'good' : 'bad', 'Images w/o alt', `${imagesNoAlt} of ${images.length}`);
  }

  push(heroImage ? 'good' : 'bad', 'Hero image', heroImage ? 'set' : 'missing');

  if (heroImage) {
    const alt = (heroImageAlt ?? '').trim();
    const altWords = alt.split(/\s+/).filter(Boolean).length;
    push(within(altWords, cfg.heroAltWords.good) ? 'good' : altWords > 0 ? 'meh' : 'bad', 'Hero alt text', altWords > 0 ? `${altWords} words` : 'missing');
  }

  const badFilenameRe = new RegExp(cfg.badFilenameRe, 'i');
  const allImagePaths: string[] = [];
  if (heroImage) allImagePaths.push(heroImage);
  for (const img of images) {
    const m = img.match(/!\[[^\]]*\]\(([^)\s]+)/);
    if (m && m[1]) allImagePaths.push(m[1]);
  }
  if (allImagePaths.length > 0) {
    const badNames = allImagePaths.filter((p) => {
      const file = p.split('/').pop() || '';
      const base = file.replace(/\.[^.]+$/, '');
      return badFilenameRe.test(base) || base.includes(' ') || base.length < 4;
    }).length;
    push(badNames === 0 ? 'good' : 'bad', 'Image filenames', badNames === 0 ? 'descriptive' : `${badNames} unhelpful`);
  }

  const slugWords = slug.split('-').filter((w) => w.length > 3);
  const titleLower = title.toLowerCase();
  const titleHasSlugWord = slugWords.some((w) => titleLower.includes(w));
  push(titleHasSlugWord ? 'good' : 'meh', 'Slug words in title', titleHasSlugWord ? 'yes' : 'no');

  const fkgl = fleschKincaidGrade(body);
  if (fkgl != null) {
    const status: ScoreStatus = within(fkgl, cfg.reading.good) ? 'good' : fkgl <= cfg.reading.mehMax ? 'meh' : 'bad';
    push(status, 'Reading level', `grade ${fkgl}`);
  }

  // Evidence/citation discipline — flag claims about studies/research/guidelines
  // without a linked references section.
  const triggerRe = new RegExp(`\\b(${cfg.evidenceTriggers.map(escapeRe).join('|')})\\b`, 'gi');
  const evidenceTriggers = body.match(triggerRe);
  if (evidenceTriggers && evidenceTriggers.length > 0) {
    const refRe = new RegExp(`^##\\s+(${cfg.referenceSectionNames.map(escapeRe).join('|')})\\b[\\s\\S]*`, 'im');
    const refMatch = body.match(refRe);
    const refBlock = refMatch ? refMatch[0] : '';
    const refLinks = (refBlock.match(/\]\(https?:\/\/[^)]+\)/g) || []).length;
    let status: ScoreStatus = 'bad';
    let value = 'missing';
    if (!refBlock) {
      value = `${evidenceTriggers.length} claim(s), no references`;
    } else if (refLinks === 0) {
      value = 'references section has no links';
    } else if (refLinks < 2 && evidenceTriggers.length >= 3) {
      status = 'meh';
      value = `${refLinks} ref(s) for ${evidenceTriggers.length} claim(s)`;
    } else {
      status = 'good';
      value = `${refLinks} ref(s)`;
    }
    push(status, 'Citations', value);
  }

  const score = Math.round(
    (checks.reduce((s, c) => s + (c.status === 'good' ? 1 : c.status === 'meh' ? 0.5 : 0), 0) / checks.length) * 100,
  );
  return {
    score,
    checks,
    badCount: checks.filter((c) => c.status === 'bad').length,
    mehCount: checks.filter((c) => c.status === 'meh').length,
  };
}

function escapeRe(s: string): string {
  // Allow already-hyphenated triggers like "meta-analysis" through unescaped
  // hyphen handling; escape regex metacharacters otherwise.
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
