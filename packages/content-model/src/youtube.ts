/**
 * YouTube URL parsing. Ported from BoH `src/lib/youtube.ts`. Dependency-free so
 * it runs in the browser, at build time and in Workers.
 */

export interface ParsedYouTube {
  videoId: string;
  /** Start offset in whole seconds, from `?t=` / `?start=` (0 = none). */
  startSeconds: number;
  /** True for youtube.com/shorts/ URLs (render vertical, 9:16). */
  isShort: boolean;
  /** Canonical watch URL, start offset preserved. */
  watchUrl: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts "90", "90s", "1m30s", "1h2m3s"; YouTube emits all of these. */
function parseStart(t: string | null): number {
  if (!t) return 0;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return parseInt(m[1] ?? '0', 10) * 3600 + parseInt(m[2] ?? '0', 10) * 60 + parseInt(m[3] ?? '0', 10);
}

/** Parse a watch, Shorts, youtu.be, embed or live URL. `null` for anything else. */
export function parseYouTubeUrl(raw: string): ParsedYouTube | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  let videoId = '';
  let isShort = false;
  if (host === 'youtu.be') {
    videoId = url.pathname.slice(1).split('/')[0] ?? '';
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') {
      videoId = url.searchParams.get('v') ?? '';
    } else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
      videoId = parts[1] ?? '';
      isShort = parts[0] === 'shorts';
    }
  } else {
    return null;
  }
  if (!VIDEO_ID.test(videoId)) return null;
  const startSeconds = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}${startSeconds ? `&t=${startSeconds}s` : ''}`;
  return { videoId, startSeconds, isShort, watchUrl };
}

/** `hqdefault` exists for every video; `maxresdefault` does not. */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
