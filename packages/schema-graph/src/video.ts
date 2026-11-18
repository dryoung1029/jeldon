import type { JsonLd } from './types.js';
import { orgId } from './url.js';

/**
 * VideoObject for an attached YouTube video. Ported from BoH
 * `src/lib/schema.ts::videoObject`.
 *
 * Google requires `name`, `thumbnailUrl` and `uploadDate` for video rich
 * results, so this returns `null` (emit nothing) when the upload date is not
 * known. Emitting a VideoObject with a guessed date is worse than none.
 * Parse the URL with `parseYouTubeUrl` from `@jeldon/content-model`.
 */
export interface VideoObjectInput {
  videoId: string;
  watchUrl: string;
  name: string;
  description: string;
  /** ISO date (YYYY-MM-DD) or a Date. Absent → no node. */
  uploadDate?: string | Date | null;
  /** Site origin, for the publisher @id. */
  siteUrl: string;
}

export function videoObjectGraph(v: VideoObjectInput): JsonLd | null {
  if (!v.uploadDate) return null;
  const d = v.uploadDate instanceof Date ? v.uploadDate : new Date(v.uploadDate);
  if (Number.isNaN(d.getTime())) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: v.name,
    description: v.description,
    thumbnailUrl: [`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`],
    uploadDate: d.toISOString().slice(0, 10),
    contentUrl: v.watchUrl,
    embedUrl: `https://www.youtube-nocookie.com/embed/${v.videoId}`,
    publisher: { '@id': orgId(v.siteUrl) },
  };
}
