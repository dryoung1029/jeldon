import type { DomainPack } from '@jeldon/config';

/**
 * The SINGLE voice read for every amplify prompt.
 *
 * Per docs/DECOUPLING-NOTES.md "Voice block duplicated ×4": BoH inlined the same
 * voice paragraph into `amplify/[slug].ts`, `carousel/[slug].ts`, and
 * `newsletter-content.ts` (and `auto-newsletter.mjs` mirrored it again). Here it
 * is built once from `pack.voice` and prepended to whatever channel/carousel/
 * newsletter craft prompt the caller assembles. Change the voice in the pack and
 * all three surfaces move together — no hand-copied paragraph to drift.
 */
export function buildVoiceBlock(pack: Pick<DomainPack, 'voice' | 'brand'>): string {
  const { voice, brand } = pack;
  const lines: string[] = ['Voice for everything you write:'];
  lines.push(`- ${voice.persona}`);
  for (const rule of voice.rules) lines.push(`- ${rule}`);
  if (voice.bannedTopics.length) {
    lines.push(`- Never: ${voice.bannedTopics.join('; ')}.`);
  }
  if (voice.bannedPhrasings.length) {
    lines.push(`- Avoid these phrasings: ${voice.bannedPhrasings.join('; ')}.`);
  }
  if (brand.geoFraming) {
    lines.push(`- Default geographic framing: "${brand.geoFraming}".`);
  }
  if (voice.voiceAnchorUrls.length) {
    lines.push(`- Tonal references (match this register): ${voice.voiceAnchorUrls.join(', ')}.`);
  }
  const [lo, hi] = voice.readingGradeBand;
  lines.push(`- Reading level: target Flesch-Kincaid grade ${lo}-${hi} in body copy.`);
  return lines.join('\n');
}
