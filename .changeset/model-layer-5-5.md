---
"@jeldon/config": minor
"@jeldon/drafting": minor
"@jeldon/amplify": minor
"@jeldon/competitive-intel": patch
"@jeldon/aeo-audit": patch
---

Move every LLM call to the Claude 5.5 request rules.

- `defaultDraftingConfig.models` now points at `claude-sonnet-5-5` / `claude-opus-5-5` / `claude-haiku-5-5`, with picker labels in the new `drafting.modelLabels`. Amplify and the AEO audit resolve through this map instead of private copies (`AnthropicLlmClient` takes `models`; `enginesFromPack` takes `drafting` and the new `aeo.model`).
- No call sends forced `tool_choice` any more (the 5.5 models return 400). Calls send `tool_choice: auto` with parallel tool use off and a use-the-tool instruction appended to the system prompt; the existing "model returned no X" checks stay as the guard. New helpers in `@jeldon/config`: `TOOL_CHOICE_AUTO`, `useToolInstruction`, `singleToolRequest`, `resolveModelId`, `effortFor`.
- Every request sets `output_config.effort` from the new `drafting.effort` map (`low` for claim extraction and hero concepts, `medium` elsewhere). Short-output budgets were raised because thinking counts toward `max_tokens` (brainstorm and claim extraction 1500 → 4000, hero concept 1024 → 4000, newsletter 1024 → 4000, amplify kit 4000 → 10000 and single channel 1500 → 6000, gap report 8000 → 16000, positioning 4000 → 8000, AEO Anthropic engine 2048 → 4000).
- The editor chat's verify loop replays `thinking` / `redacted_thinking` blocks unmodified (signature collected from `signature_delta`), which a 5.5 continuation requires.
- The AEO Anthropic engine uses `web_search_20260209`.

**Breaking (`@jeldon/drafting`):** `LlmRequest.toolChoice` is replaced by `toolName` (the tool the call expects back) and `effort`. Custom `LlmProvider` implementations should send `tool_choice: auto` when `toolName` is set.
