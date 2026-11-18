import { describe, expect, it } from 'vitest';
import {
  TopicBacklog,
  makeTopicId,
  parseBacklog,
  topicSourceGuidance,
  upsertTopics,
  type TopicEntry,
} from '../src/index.js';
import { makePack } from './fixtures.js';

function memStore(initial: string | null = null) {
  let content = initial;
  const writes: string[] = [];
  return {
    writes,
    get content() {
      return content;
    },
    store: {
      async getDataFile(path: string) {
        return content == null ? null : { path, sha: `sha${writes.length}`, content };
      },
      async saveDataFile(_path: string, c: string) {
        content = c;
        writes.push(c);
        return { sha: `sha${writes.length}` };
      },
    },
  };
}

const proposal = {
  id: 'pending-abc123',
  suggestedTitle: 'When to replace a chain',
  targetQuery: 'when to replace bike chain',
  category: 'repair',
  angle: 'a',
  keyPoints: ['x', 'y'],
  priority: 'high',
  priorityRationale: 'r',
  // The source fields BoH's whitelist dropped:
  sourceKind: 'video-editor',
  sourceTitle: 'Shop talk',
  sourceTimestampStart: 20,
  sourceTimestampEnd: 95,
  densityScore: 'strong',
  // A field the schema does not know yet:
  futureField: { nested: true },
};

describe('backlog: one schema for reader and writer', () => {
  it('a schema field the old whitelist missed, and an unknown field, both survive a save', async () => {
    const mem = memStore();
    const bl = new TopicBacklog(mem.store, { path: 'b.json', defaultCategory: 'repair', now: () => '2026-11-17T00:00:00.000Z' });
    const w = await bl.save([proposal], 'transcript');
    expect(w).toMatchObject({ status: 'ok', added: 1, updated: 0 });
    const read = await bl.read();
    if (read.status !== 'ok') throw new Error(read.status);
    const t = read.backlog.topics[0]! as TopicEntry & { futureField?: unknown };
    expect(t).toMatchObject({
      sourceKind: 'video-editor',
      sourceTitle: 'Shop talk',
      sourceTimestampStart: 20,
      sourceTimestampEnd: 95,
      densityScore: 'strong',
      status: 'new',
      source: 'transcript',
    });
    expect(t.futureField).toEqual({ nested: true });
    // And the brief that keys off them still says the thing after the round-trip.
    const guidance = topicSourceGuidance(t, makePack());
    expect(guidance).toContain('private recording');
    expect(guidance).toContain('not a citation');
    expect(guidance).toContain('Do not add a "Listen to the full conversation" callout');
  });

  it('discards placeholder ids and is idempotent on (title, query)', async () => {
    const mem = memStore();
    const bl = new TopicBacklog(mem.store, { path: 'b.json', defaultCategory: 'repair' });
    await bl.save([proposal]);
    const second = await bl.save([{ ...proposal, id: 'pending-zzz', angle: 'new angle' }]);
    expect(second).toMatchObject({ added: 0, updated: 1, total: 1 });
    const read = await bl.read();
    if (read.status !== 'ok') throw new Error(read.status);
    expect(read.backlog.topics[0]!.id).toBe(await makeTopicId(proposal.suggestedTitle, proposal.targetQuery));
    expect(read.backlog.topics[0]!.angle).toBe('new angle');
  });

  it('re-saving keeps savedAt, a user-set status, and fields the new payload omits', async () => {
    const base = parseBacklog(null);
    if (base.status === 'malformed') throw new Error('x');
    const first = await upsertTopics(base.backlog, [proposal], { now: 't1', defaultCategory: 'repair' });
    const id = first.backlog.topics[0]!.id;
    first.backlog.topics[0] = { ...first.backlog.topics[0]!, status: 'rejected' };
    const minimal = { suggestedTitle: proposal.suggestedTitle, targetQuery: proposal.targetQuery, angle: 'b' };
    const second = await upsertTopics(first.backlog, [minimal], { now: 't2', defaultCategory: 'repair' });
    const t = second.backlog.topics.find((x) => x.id === id)!;
    expect(t.savedAt).toBe('t1');
    expect(t.updatedAt).toBe('t2');
    expect(t.status).toBe('rejected');
    expect(t.sourceKind).toBe('video-editor');
  });

  it('rejects an entry with a wrong-typed field instead of silently dropping the field', async () => {
    const base = parseBacklog(null);
    if (base.status === 'malformed') throw new Error('x');
    const r = await upsertTopics(base.backlog, [{ ...proposal, sourceTimestampStart: '20' }], { now: 't', defaultCategory: 'repair' });
    expect(r.added).toBe(0);
    expect(r.invalid).toHaveLength(1);
  });

  it('never overwrites a malformed backlog file', async () => {
    const mem = memStore('{ not json');
    const bl = new TopicBacklog(mem.store, { path: 'b.json', defaultCategory: 'repair' });
    expect((await bl.save([proposal])).status).toBe('malformed');
    expect(mem.writes).toHaveLength(0);
  });

  it('keeps stored entries that fail the schema and writes them back', async () => {
    const stored = JSON.stringify({ topics: [{ id: 'old', legacy: true }], updatedAt: null });
    const mem = memStore(stored);
    const bl = new TopicBacklog(mem.store, { path: 'b.json', defaultCategory: 'repair' });
    await bl.save([proposal]);
    const written = JSON.parse(mem.content!);
    expect(written.topics).toHaveLength(2);
    expect(written.topics).toContainEqual({ id: 'old', legacy: true });
  });

  it('patch keeps the id and re-validates', async () => {
    const mem = memStore();
    const bl = new TopicBacklog(mem.store, { path: 'b.json', defaultCategory: 'repair' });
    await bl.save([proposal]);
    const id = await makeTopicId(proposal.suggestedTitle, proposal.targetQuery);
    expect(await bl.patch(id, { status: 'drafting', id: 'hijack' })).toMatchObject({ status: 'ok', topic: { id, status: 'drafting' } });
    expect((await bl.patch(id, { status: 'bogus' })).status).toBe('invalid');
    expect((await bl.patch('nope', { status: 'drafting' })).status).toBe('not_found');
  });

  it('published-source guidance carries the callout and timestamp', () => {
    const g = topicSourceGuidance(
      {
        id: 'x',
        targetQuery: 'q',
        suggestedTitle: 't',
        category: 'repair',
        angle: 'a',
        keyPoints: [],
        priority: 'high',
        status: 'new',
        savedAt: 't',
        sourceKind: 'youtube',
        sourceUrl: 'https://video.example/1',
        sourceTimestampStart: 75,
      },
      makePack(),
    );
    expect(g).toContain('Include a "Listen to the full conversation" callout linking to it at 1:15');
  });
});
