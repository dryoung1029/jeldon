/**
 * Flesch-Kincaid Grade Level for body prose, using a vowel-group syllable
 * heuristic — close enough to formal FKGL for editorial signal. Strips markdown
 * decoration + code blocks so syntax characters aren't counted as words.
 * Ported verbatim from Body of Health `src/lib/admin/seo.ts`; fully isomorphic.
 */
export function fleschKincaidGrade(text: string): number | null {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const sentences = cleaned.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0).length;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!sentences || !words.length) return null;
  let syllables = 0;
  for (const raw of words) syllables += countSyllables(raw);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}
