/**
 * Transcript sources for the miner. Two shapes:
 *   - a URL a `TranscriptFetcher` can resolve (published, has timestamps);
 *   - a raw transcript (pasted, or handed over by a video editor that writes
 *     its own `[m:ss]` anchors). No public URL; timestamps only if anchored.
 *
 * Everything downstream keys off `hasSourceUrl` / `hasTimestamps`, never off
 * which branch ran (BoH `topics/episode.ts`).
 */

export interface TranscriptSegment {
  /** Seconds. */
  start: number;
  end: number;
  text: string;
}

export interface FetchedTranscript {
  url: string;
  title: string | null;
  channel: string | null;
  durationSeconds: number | null;
  segments: TranscriptSegment[];
}

/** Resolves a published recording URL to a timestamped transcript. */
export interface TranscriptFetcher {
  readonly kind: string;
  canHandle(url: string): boolean;
  fetch(url: string): Promise<FetchedTranscript>;
}

/** `[m:ss]`, `[mm:ss]` or `[h:mm:ss]` anchors (what a video editor writes). */
export const TIMESTAMP_ANCHOR_RE = /\[\d{1,3}:\d{2}(?::\d{2})?\]/;

export function hasTimestampAnchors(text: string): boolean {
  return TIMESTAMP_ANCHOR_RE.test(text);
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** One `[m:ss]` anchor every `everySeconds` keeps the prompt readable. */
export function formatTranscriptSegments(segments: TranscriptSegment[], everySeconds = 60): string {
  const out: string[] = [];
  let nextAnchorAt = 0;
  for (const s of segments) {
    if (s.start >= nextAnchorAt) {
      out.push(`\n[${formatTimestamp(s.start)}] `);
      nextAnchorAt = s.start + everySeconds;
    }
    out.push(`${s.text} `);
  }
  return out.join('').trim();
}

export type MineInput =
  | { url: string }
  | {
      transcript: string;
      sourceTitle?: string;
      /** Where the paste came from (`paste`, `video-editor`, ...). Default `paste`. */
      sourceKind?: string;
    };

/** Provenance of the mined material, carried onto every proposal. */
export interface MinedSource {
  kind: string;
  url: string | null;
  title: string | null;
  channel: string | null;
  durationSeconds: number | null;
  segmentCount: number;
  hasTimestamps: boolean;
}

export type PreparedTranscript =
  | { status: 'ok'; source: MinedSource; transcriptBlock: string }
  | { status: 'invalid_input'; reason: string }
  | { status: 'fetch_failed'; reason: string };

/**
 * Validate and normalise a mining input. A URL is fetched here, so a failed
 * fetch returns before any model call is made.
 */
export async function prepareTranscript(
  input: MineInput,
  opts: { maxChars: number; minChars: number; anchorEverySeconds: number; fetchers: TranscriptFetcher[] },
): Promise<PreparedTranscript> {
  if ('transcript' in input && input.transcript?.trim()) {
    const raw = input.transcript.trim();
    if (raw.length > opts.maxChars) {
      return {
        status: 'invalid_input',
        reason: `Transcript is ${raw.length.toLocaleString('en-US')} characters, over the ${opts.maxChars.toLocaleString('en-US')} cap. Mine it in halves.`,
      };
    }
    if (raw.length < opts.minChars) {
      return {
        status: 'invalid_input',
        reason: `That transcript is only ${raw.length} characters, too little to mine an article from.`,
      };
    }
    return {
      status: 'ok',
      transcriptBlock: raw,
      source: {
        kind: input.sourceKind?.trim() || 'paste',
        url: null,
        title: input.sourceTitle?.trim() || null,
        channel: null,
        durationSeconds: null,
        segmentCount: raw.split(/\n+/).filter((l) => l.trim()).length,
        // A plain paste usually has no anchors; inventing them is worse than omitting them.
        hasTimestamps: hasTimestampAnchors(raw),
      },
    };
  }
  if ('url' in input && input.url?.trim()) {
    const url = input.url.trim();
    const fetcher = opts.fetchers.find((f) => f.canHandle(url));
    if (!fetcher) return { status: 'invalid_input', reason: 'No transcript fetcher recognises that URL.' };
    let t: FetchedTranscript;
    try {
      t = await fetcher.fetch(url);
    } catch (err) {
      return { status: 'fetch_failed', reason: (err as Error).message };
    }
    if (!t.segments.length) return { status: 'fetch_failed', reason: 'The transcript came back empty.' };
    return {
      status: 'ok',
      transcriptBlock: formatTranscriptSegments(t.segments, opts.anchorEverySeconds),
      source: {
        kind: fetcher.kind,
        url: t.url || url,
        title: t.title,
        channel: t.channel,
        durationSeconds: t.durationSeconds,
        segmentCount: t.segments.length,
        hasTimestamps: true,
      },
    };
  }
  return { status: 'invalid_input', reason: 'Provide either a recording URL or a transcript.' };
}
