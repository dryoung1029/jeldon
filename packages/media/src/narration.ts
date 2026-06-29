/**
 * Narration text-prep — the pure markdown→speakable-text core. No I/O, no
 * provider coupling. Ported verbatim from Body of Health
 * `src/lib/admin/narration.ts`; every domain literal that was a module constant
 * (the IPA overrides, the abbreviation table, the reference section names) is
 * now read from `NarrationConfig` so the engine is domain-agnostic.
 *
 * Source: src/lib/admin/narration.ts (BoH).
 */

import {
  defaultMediaConfig,
  type AbbreviationExpansion,
  type NarrationConfig,
  type PronunciationOverride,
} from '@jeldon/config';

const DEFAULT_NARRATION = defaultMediaConfig.narration;

/** Wrap each configured word in an inline `<phoneme alphabet="ipa">` SSML tag.
 *  ElevenLabs v2 models honor these inline. Order in the override list matters:
 *  longest compound forms first so the alternation prefers the specific word. */
export function applyPronunciation(
  text: string,
  overrides: PronunciationOverride[] = DEFAULT_NARRATION.pronunciationOverrides,
): string {
  if (!overrides.length) return text;
  const pattern = new RegExp(`\\b(${overrides.map((o) => o.word).join('|')})\\b`, 'gi');
  return text.replace(pattern, (match) => {
    const o = overrides.find((o) => o.word.toLowerCase() === match.toLowerCase());
    if (!o) return match;
    return `<phoneme alphabet="ipa" ph="${o.ipa}">${match}</phoneme>`;
  });
}

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export function spellPhoneNumber(digits: string): string {
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)];
  return groups
    .map((g) =>
      g
        .split('')
        .map((d) => DIGIT_WORDS[Number(d)])
        .join(' '),
    )
    .join(', ');
}

const ROMAN_CONTEXT =
  /\b(type|phase|class|stage|grade|level|group|tier|volume|chapter|part|book|act|edition|round|study|era|title|article|world war|figure|table|appendix)\s+([IVX]{1,5})\b/gi;

export function romanizeInContext(text: string): string {
  return text.replace(ROMAN_CONTEXT, (_, word, num) => {
    const arabic = romanToArabic(num);
    return arabic ? `${word} ${arabic}` : `${word} ${num}`;
  });
}

function romanToArabic(roman: string): string {
  const map: Record<string, number> = { I: 1, V: 5, X: 10 };
  const r = roman.toUpperCase();
  let total = 0;
  let prev = 0;
  for (let i = r.length - 1; i >= 0; i--) {
    const v = map[r[i] as string];
    if (v === undefined) return '';
    if (v < prev) total -= v;
    else total += v;
    prev = v;
  }
  return total > 0 && total <= 30 ? String(total) : '';
}

/** Expand configured abbreviations the clone otherwise reads letter-by-letter.
 *  Case-sensitive, word-bounded — never touches prose. */
export function expandAbbreviations(
  text: string,
  expansions: AbbreviationExpansion[] = DEFAULT_NARRATION.abbreviationExpansions,
): string {
  let s = text;
  for (const { abbr, full } of expansions) {
    const pattern = new RegExp(`(?<![A-Za-z])${abbr}(?![A-Za-z])`, 'g');
    s = s.replace(pattern, full);
  }
  return s;
}

/** Numeric ranges joined by hyphen / en-dash / em-dash → "X to Y". */
export function expandNumericRanges(text: string): string {
  return text.replace(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/g, '$1 to $2');
}

// Author cues: a quick 300ms pause for emphasis or rhythm. Invisible on the
// rendered page (the host's remark plugin strips `{beat}` from HTML output).
const AUTHOR_CUES: Array<[RegExp, string]> = [[/\{beat\}/gi, '<break time="0.3s" />']];

/**
 * All non-markdown text transformations a narration string needs before being
 * sent to the TTS provider. Phone normalization → numeric ranges → abbreviations
 * → Roman numerals → IPA phoneme wrapping → author cues → paragraph pacing.
 * Applied to both article bodies and the outro.
 */
export function prepareForTts(text: string, cfg: NarrationConfig = DEFAULT_NARRATION): string {
  let s = text;
  s = s.replace(/(\d)\s*[·•]\s*(\d)/g, '$1-$2');
  s = s.replace(/(?:\+?1[\s\-.])?\(?(\d{3})\)?[\s\-.](\d{3})[\s\-.](\d{4})/g, (_, a, b, c) =>
    spellPhoneNumber(a + b + c),
  );
  s = expandNumericRanges(s);
  s = expandAbbreviations(s, cfg.abbreviationExpansions);
  s = romanizeInContext(s);
  s = applyPronunciation(s, cfg.pronunciationOverrides);
  for (const [pattern, replacement] of AUTHOR_CUES) {
    s = s.replace(pattern, replacement);
  }
  // Subtle quarter-second break between paragraphs so the model gets a natural
  // pause cue instead of running paragraphs together.
  s = s.replace(/\n\n+/g, '\n\n<break time="0.25s" />\n\n');
  return s;
}

/**
 * Strip markdown to a clean spoken-word transcript, then apply prepareForTts.
 *
 * Excluded from narration to save character budget and improve listening:
 *   - The References / Citations / Sources section (configured section names →
 *     everything from that H2 to end of document)
 *   - All H2 lines (dropped entirely, not converted to sentences)
 *   - Inline citation markers like [1], [Smith 2023], (PMID: 12345), (DOI: ...)
 */
export function markdownToNarration(
  body: string,
  title?: string,
  cfg: NarrationConfig = DEFAULT_NARRATION,
): string {
  let s = body;
  const refNames = (cfg.referenceSectionNames.length
    ? cfg.referenceSectionNames
    : DEFAULT_NARRATION.referenceSectionNames
  )
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  s = s.replace(new RegExp(`\\n#{2,3}\\s+(${refNames})\\b[\\s\\S]*$`, 'i'), '');
  s = s.replace(/```[\s\S]*?```/g, '');
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  s = s.replace(/^>\s?/gm, '');
  s = s.replace(/^[*\-+]\s+/gm, '');
  s = s.replace(/^\d+\.\s+/gm, '');
  s = s.replace(/^##\s+.*$/gm, '');
  s = s.replace(/^#{1}\s+(.*)$/gm, '$1.');
  s = s.replace(/^#{3,6}\s+(.*)$/gm, '$1.');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');
  s = s.replace(/^---+$/gm, '');
  s = s.replace(/\[\d+(?:[,\s\-–]\d+)*\]/g, '');
  s = s.replace(/\[[A-Z][a-z]+(?:\s+(?:et al\.?|and|&)\s+[A-Z][a-z]+)?(?:,?\s+\d{4})\]/g, '');
  s = s.replace(/\((?:PMID|DOI|PMCID)[:\s][^)]+\)/gi, '');
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  s = prepareForTts(s, cfg);
  // Deliberate beat after the title so the body doesn't crash in on its heels.
  return title ? `${prepareForTts(title, cfg)}.\n\n<break time="0.7s" />\n\n${s}` : s;
}

/**
 * Split text into chunks under `max` chars, breaking at paragraph boundaries
 * first, then sentences if a paragraph is itself too long. Never splits
 * mid-word. The TTS provider caps single requests (BoH: ElevenLabs 10k → chunk
 * at 9000); each chunk is synthesized with previous/next context for prosody.
 */
export function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (p.length > max) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      const sentences = p.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [p];
      let sentBuf = '';
      for (const s of sentences) {
        if ((sentBuf + s).length > max) {
          if (sentBuf) chunks.push(sentBuf.trim());
          sentBuf = s;
        } else {
          sentBuf += s;
        }
      }
      if (sentBuf) chunks.push(sentBuf.trim());
      continue;
    }
    if ((current ? current.length + 2 + p.length : p.length) > max) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
