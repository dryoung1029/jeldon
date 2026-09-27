import type { DomainPack } from './types.js';

/** How article drafting happens for a project.
 *  - `'api'`   — the engine drives an LLM through `@jeldon/drafting`'s
 *                `LlmProvider` (needs an API key in `services.requiredEnv`).
 *  - `'agent'` — a coding agent (Claude Code) drafts, using the SAME prompt
 *                builders via `jeldon brief <topic>`; no API key required.
 *  - `false`   — drafting surface is off. */
export type DraftingMode = 'api' | 'agent' | false;

/** Resolve `capabilities.drafting` (boolean or mode string) to a `DraftingMode`.
 *  `true` keeps its historical meaning (`'api'`). */
export function draftingMode(pack: Pick<DomainPack, 'capabilities'>): DraftingMode {
  const v = pack.capabilities.drafting;
  if (v === true) return 'api';
  if (v === 'api' || v === 'agent') return v;
  return false;
}
