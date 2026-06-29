/**
 * VoiceMemory — persistent learned voice/preference rules, injected into every
 * author + chat system prompt so corrections stick across sessions.
 *
 * Ported from Body of Health `src/lib/admin/voice-memory.ts`. The coupling
 * broken: BoH read/wrote via `github.ts` (`getDataFile`/`saveDataFile`)
 * directly. Here it goes through the `@jeldon/store` `Store` interface
 * (`getDataFile`/`saveDataFile` on a repo-relative path) — so a project on
 * `FsStore` gets the same behavior with no GitHub. The 5-minute TTL cache, the
 * 400-char per-rule limit, the maxRules eviction, and `formatRulesForPrompt`
 * are all lifted verbatim.
 */

import type { Store } from '@jeldon/store';

/** Repo-relative path. Override for a project that files data elsewhere. */
export const DEFAULT_VOICE_MEMORY_PATH = 'src/data/voice-memory.json';

const TTL_MS = 5 * 60 * 1000;
const MAX_RULE_LEN = 400;

export interface VoiceRule {
  id: string;
  text: string;
  addedAt: string;
  source: string;
}

export interface VoiceMemoryData {
  rules: VoiceRule[];
  maxRules: number;
}

const DEFAULT_DATA: VoiceMemoryData = { rules: [], maxRules: 30 };

function parse(content: string): VoiceMemoryData {
  try {
    const obj = JSON.parse(content) as Partial<VoiceMemoryData>;
    return {
      rules: Array.isArray(obj.rules) ? (obj.rules as VoiceRule[]) : [],
      maxRules: typeof obj.maxRules === 'number' ? obj.maxRules : 30,
    };
  } catch {
    return { ...DEFAULT_DATA };
  }
}

/**
 * The store. One instance per request/process; the module-scope cache in BoH is
 * here an instance field so multiple packs/stores don't share a stale cache.
 */
export class VoiceMemory {
  private readonly store: Store;
  private readonly path: string;
  private cache: { data: VoiceMemoryData; sha: string | null; fetchedAt: number } | null = null;

  constructor(store: Store, opts: { path?: string } = {}) {
    this.store = store;
    this.path = opts.path ?? DEFAULT_VOICE_MEMORY_PATH;
  }

  private async fetchFresh(): Promise<{ data: VoiceMemoryData; sha: string | null }> {
    const file = await this.store.getDataFile(this.path);
    if (!file) return { data: { ...DEFAULT_DATA }, sha: null };
    return { data: parse(file.content), sha: file.sha };
  }

  /** Read (TTL-cached). Best-effort — any failure yields the empty default. */
  async get(): Promise<VoiceMemoryData> {
    if (this.cache && Date.now() - this.cache.fetchedAt < TTL_MS) return this.cache.data;
    try {
      const { data, sha } = await this.fetchFresh();
      this.cache = { data, sha, fetchedAt: Date.now() };
      return data;
    } catch {
      return { ...DEFAULT_DATA };
    }
  }

  /** Add a rule (committed via the store). BoH `addVoiceRule`. */
  async addRule(text: string, source = 'editor-chat'): Promise<VoiceRule> {
    const { data, sha } = await this.fetchFresh();
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Rule text is empty');
    if (trimmed.length > MAX_RULE_LEN) throw new Error(`Rule too long (max ${MAX_RULE_LEN} chars)`);
    const rule: VoiceRule = {
      id: `vm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      addedAt: new Date().toISOString(),
      source,
    };
    data.rules.push(rule);
    while (data.rules.length > data.maxRules) data.rules.shift();
    const next = await this.store.saveDataFile(
      this.path,
      JSON.stringify(data, null, 2) + '\n',
      sha,
      `voice-memory: add rule (${source})`,
    );
    this.cache = { data, sha: next.sha, fetchedAt: Date.now() };
    return rule;
  }

  /** Remove a rule by id. BoH `removeVoiceRule`. */
  async removeRule(id: string): Promise<void> {
    const { data, sha } = await this.fetchFresh();
    const idx = data.rules.findIndex((r) => r.id === id);
    if (idx < 0) return;
    data.rules.splice(idx, 1);
    const next = await this.store.saveDataFile(
      this.path,
      JSON.stringify(data, null, 2) + '\n',
      sha,
      'voice-memory: remove rule',
    );
    this.cache = { data, sha: next.sha, fetchedAt: Date.now() };
  }
}

/** Format rules for prompt injection. BoH `formatRulesForPrompt`, verbatim. */
export function formatRulesForPrompt(rules: VoiceRule[]): string {
  if (!rules.length) return '';
  return `## Editor's standing preferences (learned over time)

These rules were added by the editor as corrections during past sessions. Apply them automatically without being asked. If two rules conflict, prefer the most recent. If a rule conflicts with the core voice rules above, raise it briefly and ask — don't silently override the brand voice.

${rules.map((r) => `- ${r.text}`).join('\n')}
`;
}
