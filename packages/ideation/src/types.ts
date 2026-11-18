import type { DomainPack } from '@jeldon/config';

/** The slice of the Domain Pack the ideation modules read. */
export type IdeationPack = Pick<DomainPack, 'brand' | 'authors' | 'voice' | 'content'> &
  Partial<Pick<DomainPack, 'aeo' | 'competitors' | 'ideation' | 'listening' | 'drafting'>>;

/** One article in the existing catalog, for de-duplication in prompts. */
export interface InventoryArticle {
  slug: string;
  title: string;
  excerpt?: string;
  category?: string;
  draft?: boolean;
}

/** A proposal as the mining / brief tools return it (before it is saved). */
export interface TopicProposal {
  suggestedTitle: string;
  targetQuery: string;
  category: string;
  angle: string;
  keyPoints: string[];
  priority: 'high' | 'medium' | 'low';
  priorityRationale: string;
  complementsExisting?: string;
  relatedQueries?: string[];
  sourceThreads?: string[];
  coreEvidenceClaim?: string;
  sourceKind?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceTimestampStart?: number;
  sourceTimestampEnd?: number;
  densityScore?: 'strong' | 'medium' | 'weak';
  source?: string;
  [extra: string]: unknown;
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
}

/** The primary author's display name, or the brand when none is marked. */
export function primaryAuthorName(pack: IdeationPack): string {
  return (pack.authors.find((a) => a.isPrimary) ?? pack.authors[0])?.name ?? pack.brand.name;
}

/** Shared voice block for ideation prompts. Built from `pack.voice` only. */
export function ideationVoiceBlock(pack: IdeationPack): string {
  const lines = [`- ${pack.voice.persona}`];
  if (pack.voice.bannedTopics.length) lines.push(`- Never propose articles about: ${pack.voice.bannedTopics.join('; ')}`);
  if (pack.voice.bannedPhrasings.length) {
    lines.push(`- Never use these phrasings: ${pack.voice.bannedPhrasings.map((p) => `"${p}"`).join(', ')}`);
  }
  for (const r of pack.voice.rules) lines.push(`- ${r}`);
  lines.push(`- Articles fall into one of these categories: ${pack.content.categories.join(' | ')}.`);
  if (pack.brand.geoFraming) lines.push(`- Default geographic framing: "${pack.brand.geoFraming}".`);
  return lines.join('\n');
}
