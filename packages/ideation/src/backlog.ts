/**
 * The topic backlog — saved / drafting / archived / rejected article ideas.
 *
 * Port of Body of Health `src/pages/api/admin/topics/backlog.ts`, with its
 * one big lesson designed out. BoH's POST handler rebuilt every entry from a
 * hand-written whitelist of fields. The whitelist had none of the source
 * fields (`sourceKind`, `sourceUrl`, `sourceTimestampStart`, ...), so a saved
 * transcript proposal came back without them and the brief builder silently
 * took the episode branch; saved episode briefs had been losing their
 * cross-promotion the same way since the miner shipped. The brief still
 * rendered, it just stopped saying the thing.
 *
 * Here there is ONE exported Zod schema, `topicEntrySchema`. The reader parses
 * stored entries with it and the writer parses incoming entries with it; no
 * code picks fields by hand. The object is loose, so a field the schema does
 * not know yet survives a save too.
 */

import type { Store } from '@jeldon/store';
import { z } from 'zod';
import type { IdeationPack } from './types.js';

export const TOPIC_STATUSES = ['new', 'drafting', 'archived', 'rejected'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

const citationFeasibilitySchema = z.looseObject({
  verdict: z.string(),
  claim: z.string(),
  source: z
    .looseObject({ url: z.string().optional(), title: z.string().optional(), quote: z.string().optional() })
    .nullable(),
  note: z.string().nullable(),
});

/** The one backlog entry schema. Reader and writer both parse with this. */
export const topicEntrySchema = z.looseObject({
  id: z.string().min(1),
  targetQuery: z.string(),
  suggestedTitle: z.string(),
  category: z.string(),
  angle: z.string(),
  keyPoints: z.array(z.string()),
  priority: z.enum(['high', 'medium', 'low']),
  priorityRationale: z.string().optional(),
  complementsExisting: z.string().optional(),
  relatedQueries: z.array(z.string()).optional(),
  /** Thread permalinks a listening proposal came from (provenance). */
  sourceThreads: z.array(z.string()).optional(),
  /** Where a mined proposal came from. A published source carries `sourceUrl`
   *  (its articles cross-promote it); a private recording carries a kind and
   *  no URL (its articles must not invent one to link). */
  sourceKind: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceTimestampStart: z.number().int().min(0).optional(),
  sourceTimestampEnd: z.number().int().min(0).optional(),
  densityScore: z.enum(['strong', 'medium', 'weak']).optional(),
  coreEvidenceClaim: z.string().optional(),
  citationFeasibility: citationFeasibilitySchema.optional(),
  status: z.enum(TOPIC_STATUSES),
  savedAt: z.string(),
  updatedAt: z.string().optional(),
  /** Which ideation surface produced it (`transcript`, `reddit`, ...). */
  source: z.string().optional(),
});

export type TopicEntry = z.infer<typeof topicEntrySchema>;

/** What a writer accepts: the same schema with server-filled fields optional. */
export const topicInputSchema = topicEntrySchema.partial();
export type TopicInput = z.input<typeof topicInputSchema>;

const backlogFileSchema = z.looseObject({
  topics: z.array(z.unknown()).default([]),
  updatedAt: z.string().nullable().optional(),
});

export interface Backlog {
  topics: TopicEntry[];
  /** Stored entries that fail the schema. Kept verbatim and written back, never dropped. */
  invalid: unknown[];
  updatedAt: string | null;
}

export type BacklogParseResult =
  | { status: 'ok'; backlog: Backlog }
  | { status: 'missing'; backlog: Backlog }
  /** Unparseable file. Writers must refuse: saving would overwrite it with an empty list. */
  | { status: 'malformed'; reason: string };

const emptyBacklog = (): Backlog => ({ topics: [], invalid: [], updatedAt: null });

/** Parse the stored backlog file. `null` / '' = no file yet. */
export function parseBacklog(raw: string | null | undefined): BacklogParseResult {
  if (raw == null || !raw.trim()) return { status: 'missing', backlog: emptyBacklog() };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { status: 'malformed', reason: `backlog is not valid JSON: ${(err as Error).message}` };
  }
  const file = backlogFileSchema.safeParse(json);
  if (!file.success) return { status: 'malformed', reason: `backlog has no topics array: ${file.error.message}` };
  const backlog = emptyBacklog();
  backlog.updatedAt = file.data.updatedAt ?? null;
  for (const t of file.data.topics) {
    const parsed = topicEntrySchema.safeParse(t);
    if (parsed.success) backlog.topics.push(parsed.data);
    else backlog.invalid.push(t);
  }
  return { status: 'ok', backlog };
}

/** Serialise for storage (pretty JSON + trailing newline, as BoH wrote it). */
export function serializeBacklog(backlog: Backlog): string {
  return `${JSON.stringify({ topics: [...backlog.topics, ...backlog.invalid], updatedAt: backlog.updatedAt }, null, 2)}\n`;
}

/** The proposal cards mint throwaway `pending-…` ids for DOM keys. Never trust them. */
export function isPlaceholderId(id: unknown): boolean {
  return typeof id !== 'string' || !id || /^pending-/.test(id);
}

/** Stable id from title + query (SHA-1, first 6 bytes hex), so re-saving an idea updates it. */
export async function makeTopicId(title: string, query: string): Promise<string> {
  const seed = `${title}|${query}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const hash = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(hash))
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface UpsertResult {
  backlog: Backlog;
  added: number;
  updated: number;
  /** Inputs that failed the schema, with the reason. Not saved, not silently coerced. */
  invalid: Array<{ index: number; reason: string }>;
}

/**
 * Append or update topics. Idempotent on (suggestedTitle, targetQuery). An
 * existing entry keeps its `savedAt`, and keeps its status unless the input
 * sets one. Every field of the existing entry that the input does not set
 * survives (BoH replaced the whole entry).
 */
export async function upsertTopics(
  backlog: Backlog,
  inputs: unknown[],
  opts: { now: string; source?: string; defaultCategory: string },
): Promise<UpsertResult> {
  const next: Backlog = { ...backlog, topics: [...backlog.topics] };
  let added = 0;
  let updated = 0;
  const invalid: UpsertResult['invalid'] = [];
  for (let i = 0; i < inputs.length; i++) {
    const parsedIn = topicInputSchema.safeParse(inputs[i]);
    if (!parsedIn.success) {
      invalid.push({ index: i, reason: parsedIn.error.message });
      continue;
    }
    const t = parsedIn.data;
    const id = isPlaceholderId(t.id)
      ? await makeTopicId(t.suggestedTitle ?? '', t.targetQuery ?? '')
      : (t.id as string);
    const idx = next.topics.findIndex((e) => e.id === id);
    const existing = idx >= 0 ? next.topics[idx] : undefined;
    const source = t.source ?? existing?.source ?? opts.source;
    const merged = topicEntrySchema.safeParse({
      targetQuery: '',
      suggestedTitle: '',
      category: opts.defaultCategory,
      angle: '',
      keyPoints: [],
      priority: 'medium',
      ...(existing ?? {}),
      ...stripUndefined(t),
      id,
      status: t.status ?? existing?.status ?? 'new',
      savedAt: existing?.savedAt ?? opts.now,
      updatedAt: opts.now,
      ...(source ? { source } : {}),
    });
    if (!merged.success) {
      invalid.push({ index: i, reason: merged.error.message });
      continue;
    }
    if (idx >= 0) {
      next.topics[idx] = merged.data;
      updated++;
    } else {
      next.topics.push(merged.data);
      added++;
    }
  }
  if (added || updated) next.updatedAt = opts.now;
  return { backlog: next, added, updated, invalid };
}

function stripUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export type PatchResult =
  | { status: 'ok'; backlog: Backlog; topic: TopicEntry }
  | { status: 'not_found'; id: string }
  | { status: 'invalid'; reason: string };

/** Merge a patch into one topic. The id cannot change; the result is re-validated. */
export function patchTopic(backlog: Backlog, id: string, patch: unknown, now: string): PatchResult {
  const idx = backlog.topics.findIndex((t) => t.id === id);
  if (idx < 0) return { status: 'not_found', id };
  const p = topicInputSchema.safeParse(patch);
  if (!p.success) return { status: 'invalid', reason: p.error.message };
  const merged = topicEntrySchema.safeParse({ ...backlog.topics[idx], ...stripUndefined(p.data), id, updatedAt: now });
  if (!merged.success) return { status: 'invalid', reason: merged.error.message };
  const topics = [...backlog.topics];
  topics[idx] = merged.data;
  return { status: 'ok', backlog: { ...backlog, topics, updatedAt: now }, topic: merged.data };
}

/** Hard delete. The UI should prefer `status: 'rejected'` so miners stop re-proposing it. */
export function deleteTopic(backlog: Backlog, id: string): { status: 'ok'; backlog: Backlog } | { status: 'not_found'; id: string } {
  const topics = backlog.topics.filter((t) => t.id !== id);
  if (topics.length === backlog.topics.length) return { status: 'not_found', id };
  return { status: 'ok', backlog: { ...backlog, topics } };
}

// ---------------------------------------------------------------------------
// Store-backed wrapper
// ---------------------------------------------------------------------------

export type BacklogWriteResult<T> = ({ status: 'ok' } & T) | { status: 'malformed'; reason: string } | { status: 'not_found'; id: string } | { status: 'invalid'; reason: string };

/**
 * The backlog over a `Store` data file. Every write re-reads, applies the pure
 * operation, and saves with the sha it read. A malformed file is never
 * overwritten.
 */
export class TopicBacklog {
  constructor(
    private readonly store: Pick<Store, 'getDataFile' | 'saveDataFile'>,
    private readonly opts: { path: string; defaultCategory: string; now?: () => string },
  ) {}

  static fromPack(store: Pick<Store, 'getDataFile' | 'saveDataFile'>, pack: IdeationPack, now?: () => string): TopicBacklog {
    return new TopicBacklog(store, {
      path: pack.ideation?.backlog.path ?? 'src/data/topic-backlog.json',
      defaultCategory: pack.content.categories[0] ?? 'general',
      now,
    });
  }

  private now(): string {
    return this.opts.now ? this.opts.now() : new Date().toISOString();
  }

  private async load(): Promise<{ parsed: BacklogParseResult; sha: string | null }> {
    const file = await this.store.getDataFile(this.opts.path);
    return { parsed: parseBacklog(file?.content ?? null), sha: file?.sha ?? null };
  }

  async read(): Promise<BacklogParseResult> {
    return (await this.load()).parsed;
  }

  async save(inputs: unknown[], source?: string): Promise<BacklogWriteResult<{ added: number; updated: number; total: number; invalid: UpsertResult['invalid'] }>> {
    const { parsed, sha } = await this.load();
    if (parsed.status === 'malformed') return parsed;
    const r = await upsertTopics(parsed.backlog, inputs, { now: this.now(), source, defaultCategory: this.opts.defaultCategory });
    if (r.added || r.updated) {
      await this.store.saveDataFile(this.opts.path, serializeBacklog(r.backlog), sha, `ideation: topic backlog +${r.added} ~${r.updated}`);
    }
    return { status: 'ok', added: r.added, updated: r.updated, total: r.backlog.topics.length, invalid: r.invalid };
  }

  async patch(id: string, patch: unknown): Promise<BacklogWriteResult<{ topic: TopicEntry }>> {
    const { parsed, sha } = await this.load();
    if (parsed.status === 'malformed') return parsed;
    const r = patchTopic(parsed.backlog, id, patch, this.now());
    if (r.status !== 'ok') return r;
    await this.store.saveDataFile(this.opts.path, serializeBacklog(r.backlog), sha, `ideation: update topic ${id}`);
    return { status: 'ok', topic: r.topic };
  }

  async remove(id: string): Promise<BacklogWriteResult<{ deleted: string }>> {
    const { parsed, sha } = await this.load();
    if (parsed.status === 'malformed') return parsed;
    const r = deleteTopic(parsed.backlog, id);
    if (r.status !== 'ok') return r;
    await this.store.saveDataFile(this.opts.path, serializeBacklog({ ...r.backlog, updatedAt: this.now() }), sha, `ideation: delete topic ${id}`);
    return { status: 'ok', deleted: id };
  }
}

// ---------------------------------------------------------------------------
// Prompt + brief helpers that key off saved fields
// ---------------------------------------------------------------------------

/** "Already saved" and "previously rejected" blocks for a mining prompt. */
export function backlogPromptBlocks(topics: Array<Pick<TopicEntry, 'suggestedTitle' | 'targetQuery' | 'status'>>): string {
  const active = topics.filter((t) => t.status !== 'rejected');
  const rejected = topics.filter((t) => t.status === 'rejected');
  const line = (t: Pick<TopicEntry, 'suggestedTitle' | 'targetQuery'>) => `- "${t.suggestedTitle}" (target: ${t.targetQuery})`;
  return [
    active.length ? `ALREADY IN BACKLOG (skip these even if the source covers the topic):\n${active.map(line).join('\n')}\n\n` : '',
    rejected.length
      ? `PREVIOUSLY REJECTED (the user explicitly killed these — do not re-propose):\n${rejected.map(line).join('\n')}\n\n`
      : '',
  ].join('');
}

/**
 * Drafting guidance that depends on where a saved topic came from. This is the
 * consumer that BoH's whitelist starved: it reads the source fields, so they
 * must survive a save.
 */
export function topicSourceGuidance(entry: TopicEntry, pack: IdeationPack): string {
  const miner = pack.ideation?.transcriptMiner;
  const noun = miner?.publishedSourceNoun ?? 'episode';
  const callout = miner?.listenCalloutLabel ?? 'Listen to the full conversation';
  const fmtTs = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const parts: string[] = [];
  if (entry.sourceUrl) {
    const at = typeof entry.sourceTimestampStart === 'number' ? ` at ${fmtTs(entry.sourceTimestampStart)}` : '';
    parts.push(
      `SOURCE: mined from a published ${noun}${entry.sourceTitle ? ` ("${entry.sourceTitle}")` : ''}: ${entry.sourceUrl}. The article stands alone as a written piece and references the ${noun} as additional listening, not a transcript of it. Include a "${callout}" callout linking to it${at}.`,
    );
  } else if (entry.sourceKind) {
    parts.push(
      `SOURCE: mined from a private recording${entry.sourceTitle ? ` ("${entry.sourceTitle}")` : ''} with no public URL. Do not add a "${callout}" callout and do not reference a ${noun}; there is nothing to link. What was said off the cuff is not a citation: every claim inherited from the recording needs a real published source or it is cut.`,
    );
  }
  if (entry.sourceThreads?.length) {
    parts.push(
      `LISTENING SOURCE: built from community threads (${entry.sourceThreads.join(', ')}). Those are other people's stories: never retell one as ${pack.brand.name}'s own case. Use them only as evidence of what people ask.`,
    );
  }
  return parts.join('\n\n');
}
