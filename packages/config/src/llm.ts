/**
 * LLM request rules shared by every engine package that calls a model.
 *
 * Ported from Body of Health `src/lib/admin/claude-models.ts` (2026-10-27),
 * which replaced fourteen drifted private copies of the model map. In Jeldon
 * the IDs themselves live in the Domain Pack (`drafting.models`, defaults in
 * `defaultDraftingConfig`); this module holds only the request mechanics, so
 * amplify, aeo-audit, competitive-intel and drafting build requests the same
 * way.
 *
 * Rules the Claude 5.5 family enforces (all three models):
 * - Forced tool use (`tool_choice: { type: 'tool' | 'any' }`) returns a 400.
 *   Send `TOOL_CHOICE_AUTO`, state the expectation with `useToolInstruction()`,
 *   and keep the caller's "model returned no X" check as the guard.
 * - Thinking is on by default and counts toward `max_tokens`. Set
 *   `output_config.effort` explicitly (Sonnet 5.5 defaults to `high`). Never
 *   send `thinking: { type: 'disabled' }` or `budget_tokens`; both return 400.
 * - Read content blocks by `type`, never by position: a response can begin
 *   with `thinking` blocks. In a multi-turn tool loop, replay those blocks
 *   unmodified (signature included) or the continuation is rejected.
 */

import type { DraftingConfig, LlmEffort } from './types.js';

/** The only `tool_choice` the 5.5 models accept; one tool keeps the old single-call shape. */
export const TOOL_CHOICE_AUTO = { type: 'auto', disable_parallel_tool_use: true } as const;

/** Current server-side web search tool version. */
export const WEB_SEARCH_TOOL_TYPE = 'web_search_20260209';

/**
 * Prompt-side replacement for a forced tool call. Appended to the system
 * prompt of every call that expects exactly one tool call back.
 */
export function useToolInstruction(toolName: string): string {
  return `\n\nRESPONSE FORMAT: respond by calling the \`${toolName}\` tool exactly once with the complete result. Do not answer in prose, do not explain, and do not skip the tool call.`;
}

/**
 * Resolve a model alias (`sonnet`) or a raw provider id against an alias map.
 * Unknown aliases fall back to `defaultAlias`; a string that is not an alias
 * but looks like a provider id (contains `-`) passes through unchanged.
 */
export function resolveModelId(
  models: Record<string, string>,
  defaultAlias: string,
  requested?: string | null,
): string {
  if (requested && models[requested]) return models[requested];
  if (requested && requested.includes('-')) return requested;
  return models[defaultAlias] ?? requested ?? defaultAlias;
}

/**
 * The effort for one call site. Looks up `drafting.effort[purpose]`, then
 * `drafting.effort.default`, then `medium`. Purposes used by the engine:
 * the drafting modes, `fixPass`, `extractClaims`, `chat`, `heroConcept`,
 * `amplify`, `newsletter`, `gapReport`, `positioning`, `aeoAudit`.
 */
export function effortFor(
  drafting: Pick<DraftingConfig, 'effort'> | undefined,
  purpose: string,
): LlmEffort {
  const map = drafting?.effort;
  return map?.[purpose] ?? map?.default ?? 'medium';
}

/**
 * The 5.5-safe request fields for a call that expects one structured tool
 * call back: `tools`, `tool_choice` and the system prompt with the
 * use-the-tool instruction appended.
 */
export function singleToolRequest<T extends { name: string }>(
  system: string,
  tool: T,
): { system: string; tools: T[]; tool_choice: typeof TOOL_CHOICE_AUTO } {
  return {
    system: `${system}${useToolInstruction(tool.name)}`,
    tools: [tool],
    tool_choice: TOOL_CHOICE_AUTO,
  };
}
