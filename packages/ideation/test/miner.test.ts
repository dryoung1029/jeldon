import type { LlmRequest } from '@jeldon/drafting';
import { describe, expect, it } from 'vitest';
import {
  buildMinerSystem,
  buildMinerTool,
  extractVideoId,
  formatTranscriptSegments,
  hasTimestampAnchors,
  mineTranscript,
  type TranscriptFetcher,
} from '../src/index.js';
import { makePack, recordingProvider, res } from './fixtures.js';

const LONG = 'We talked about chain wear and when to replace a cassette. '.repeat(12);

const proposal = (extra: Record<string, unknown> = {}) => ({
  suggestedTitle: 'When to replace a chain',
  category: 'repair',
  angle: 'a',
  keyPoints: ['x', 'y'],
  targetQuery: 'when to replace bike chain',
  priority: 'high',
  priorityRationale: 'r',
  densityScore: 'strong',
  ...extra,
});

function minerProvider(calls: LlmRequest[], p = proposal()) {
  return recordingProvider(
    () => res([{ type: 'tool_use', name: 'propose_transcript_articles', input: { proposals: [p], summary: 's' } }]),
    calls,
  );
}

const fetcher = (fail = false): TranscriptFetcher => ({
  kind: 'test-video',
  canHandle: (u) => u.startsWith('https://video.example/'),
  async fetch(url) {
    if (fail) throw new Error('This video has no captions available.');
    return {
      url,
      title: 'Ep 1',
      channel: 'Ch',
      durationSeconds: 125,
      segments: [
        { start: 0, end: 5, text: 'hello' },
        { start: 30, end: 35, text: 'chains' },
        { start: 65, end: 70, text: 'cassettes' },
      ],
    };
  },
});

describe('miner prompt branches on the source shape', () => {
  const pack = makePack();

  it('published source: cross-promotion callout', () => {
    const s = buildMinerSystem(pack, { hasSourceUrl: true, hasTimestamps: true });
    expect(s).toContain('CROSS-PROMOTION GOAL');
    expect(s).toContain('includes a "Listen to the full conversation" callout linking to the episode');
    expect(s).not.toContain('SOURCE MATERIAL');
  });

  it('private recording: no callout, off-the-cuff statements are not citations', () => {
    const s = buildMinerSystem(pack, { hasSourceUrl: false, hasTimestamps: false });
    expect(s).toContain('SOURCE MATERIAL');
    expect(s).toContain('do NOT propose a "Listen to the full conversation" callout');
    expect(s).not.toMatch(/includes a "Listen to the full conversation" callout/);
    expect(s).not.toContain('CROSS-PROMOTION');
    expect(s).toContain('What is said off the cuff is not a citation');
    expect(s).toContain('OMIT sourceTimestampStart');
  });

  it('is built from the pack: brand, author, categories, banned topics, geo framing', () => {
    const s = buildMinerSystem(pack, { hasSourceUrl: false, hasTimestamps: false });
    expect(s).toContain('Northwind Bikes');
    expect(s).toContain('Sam Rivera');
    expect(s).toContain('repair | buying');
    expect(s).toContain('crypto');
    expect(s).toContain('Lakeside and Hilltown');
    const other = buildMinerSystem(
      makePack({
        brand: { name: 'Quill Legal', siteUrl: 'https://q.example' },
        ideation: {
          transcriptMiner: {
            maxChars: 1000,
            minChars: 10,
            publishedSourceNoun: 'webinar',
            listenCalloutLabel: 'Watch the webinar',
            maxProposals: { published: 4, private: 2 },
            anchorEverySeconds: 30,
            maxTokens: 4000,
          },
          backlog: { path: 'x.json' },
        },
      }),
      { hasSourceUrl: true, hasTimestamps: true },
    );
    expect(other).toContain('Quill Legal');
    expect(other).toContain('"Watch the webinar" callout linking to the webinar');
    expect(other).not.toContain('Northwind');
  });
});

describe('conditional start timestamp (regression: the model invents one)', () => {
  const required = (hasTs: boolean) =>
    ((buildMinerTool(makePack(), hasTs).input_schema as any).properties.proposals.items.required as string[]);

  it('requires sourceTimestampStart only when the source has timestamps', () => {
    expect(required(true)).toContain('sourceTimestampStart');
    expect(required(false)).not.toContain('sourceTimestampStart');
  });

  it('detects [m:ss] / [h:mm:ss] anchors in a paste', () => {
    expect(hasTimestampAnchors('[0:00] hi [12:34] there')).toBe(true);
    expect(hasTimestampAnchors('[1:02:03] hi')).toBe(true);
    expect(hasTimestampAnchors('at 12:34 we talked')).toBe(false);
  });

  it('a plain paste goes out without the timestamp requirement and invented timestamps are stripped', async () => {
    const calls: LlmRequest[] = [];
    const r = await mineTranscript(
      { transcript: LONG, sourceTitle: 'Shop talk' },
      { pack: makePack(), provider: minerProvider(calls, proposal({ sourceTimestampStart: 42, sourceTimestampEnd: 90 })) },
    );
    const req = calls[0]!;
    expect((req.tools![0]!.input_schema as any).properties.proposals.items.required).not.toContain('sourceTimestampStart');
    expect(req.toolName).toBe('propose_transcript_articles');
    expect(req.effort).toBe('medium');
    expect(String(req.messages[0]!.content)).toContain('no URL to link');
    expect(String(req.messages[0]!.content)).not.toContain('Source URL');
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.source.hasTimestamps).toBe(false);
    expect(r.proposals[0]!.sourceTimestampStart).toBeUndefined();
    expect(r.proposals[0]!.sourceKind).toBe('paste');
    expect(r.proposals[0]!.sourceUrl).toBeUndefined();
  });

  it('an anchored video-editor handoff keeps the requirement', async () => {
    const calls: LlmRequest[] = [];
    const anchored = `[0:00] ${LONG}\n[0:20] more about chains`;
    const r = await mineTranscript(
      { transcript: anchored, sourceKind: 'video-editor' },
      { pack: makePack(), provider: minerProvider(calls, proposal({ sourceTimestampStart: 20 })) },
    );
    expect((calls[0]!.tools![0]!.input_schema as any).properties.proposals.items.required).toContain('sourceTimestampStart');
    expect(r.status === 'ok' && r.proposals[0]!.sourceTimestampStart).toBe(20);
    // Still a private recording: no callout.
    expect(calls[0]!.system).toContain('SOURCE MATERIAL');
  });
});

describe('mineTranscript inputs', () => {
  it('enforces the 200k cap and the 400 floor without calling the model', async () => {
    const calls: LlmRequest[] = [];
    const deps = { pack: makePack(), provider: minerProvider(calls) };
    expect((await mineTranscript({ transcript: 'x'.repeat(200_001) }, deps)).status).toBe('invalid_input');
    expect((await mineTranscript({ transcript: 'x'.repeat(399) }, deps)).status).toBe('invalid_input');
    expect((await mineTranscript({ transcript: 'x'.repeat(400) }, deps)).status).toBe('ok');
    expect(calls).toHaveLength(1);
  });

  it('a URL fetch failure returns fetch_failed and burns no model call', async () => {
    const calls: LlmRequest[] = [];
    const r = await mineTranscript(
      { url: 'https://video.example/1' },
      { pack: makePack(), provider: minerProvider(calls), fetchers: [fetcher(true)] },
    );
    expect(r).toEqual({ status: 'fetch_failed', reason: 'This video has no captions available.' });
    expect(calls).toHaveLength(0);
  });

  it('a fetched published source carries its URL onto proposals and asks for timestamps', async () => {
    const calls: LlmRequest[] = [];
    const r = await mineTranscript(
      { url: 'https://video.example/1' },
      { pack: makePack(), provider: minerProvider(calls, proposal({ sourceTimestampStart: 30 })), fetchers: [fetcher()] },
    );
    expect(calls[0]!.system).toContain('CROSS-PROMOTION');
    expect(String(calls[0]!.messages[0]!.content)).toContain('Source URL: https://video.example/1');
    expect(String(calls[0]!.messages[0]!.content)).toContain('[1:05] cassettes');
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.proposals[0]).toMatchObject({ sourceUrl: 'https://video.example/1', sourceKind: 'test-video', sourceTimestampStart: 30 });
  });

  it('reports no_proposals when the tool call is missing (not an empty ok)', async () => {
    const r = await mineTranscript(
      { transcript: LONG },
      { pack: makePack(), provider: recordingProvider(() => res([{ type: 'text', text: 'hmm' }], 'end_turn')) },
    );
    expect(r.status).toBe('no_proposals');
  });

  it('includes saved and rejected backlog entries in the prompt', async () => {
    const calls: LlmRequest[] = [];
    await mineTranscript(
      { transcript: LONG },
      {
        pack: makePack(),
        provider: minerProvider(calls),
        backlog: [
          { suggestedTitle: 'Saved one', targetQuery: 'q1', status: 'new' },
          { suggestedTitle: 'Killed one', targetQuery: 'q2', status: 'rejected' },
        ],
      },
    );
    const msg = String(calls[0]!.messages[0]!.content);
    expect(msg).toMatch(/ALREADY IN BACKLOG[\s\S]*Saved one/);
    expect(msg).toMatch(/PREVIOUSLY REJECTED[\s\S]*Killed one/);
  });
});

describe('transcript helpers', () => {
  it('anchors roughly every N seconds', () => {
    const out = formatTranscriptSegments(
      [
        { start: 0, end: 1, text: 'a' },
        { start: 10, end: 11, text: 'b' },
        { start: 61, end: 62, text: 'c' },
      ],
      60,
    );
    expect(out).toBe('[0:00] a b \n[1:01] c');
  });

  it('extracts video ids from the usual URL shapes', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});
