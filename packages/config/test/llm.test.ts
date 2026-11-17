import { describe, expect, it } from 'vitest';
import {
  TOOL_CHOICE_AUTO,
  defaultDraftingConfig,
  effortFor,
  resolveModelId,
  singleToolRequest,
} from '../src/index.js';

describe('model layer helpers', () => {
  it('resolves aliases, passes raw ids through, falls back to the default alias', () => {
    const m = defaultDraftingConfig.models;
    expect(resolveModelId(m, 'sonnet', 'opus')).toBe('claude-opus-5-5');
    expect(resolveModelId(m, 'sonnet', 'claude-custom-1')).toBe('claude-custom-1');
    expect(resolveModelId(m, 'sonnet', 'nonsense')).toBe('claude-sonnet-5-5');
    expect(resolveModelId(m, 'sonnet')).toBe('claude-sonnet-5-5');
  });

  it('picks per-purpose effort, then default, then medium', () => {
    expect(effortFor(defaultDraftingConfig, 'extractClaims')).toBe('low');
    expect(effortFor(defaultDraftingConfig, 'draft')).toBe('medium');
    expect(effortFor(undefined, 'draft')).toBe('medium');
    expect(effortFor({ effort: { default: 'high' } }, 'x')).toBe('high');
  });

  it('never forces a tool', () => {
    const r = singleToolRequest('SYS', { name: 'gap_report' });
    expect(r.tool_choice).toEqual(TOOL_CHOICE_AUTO);
    expect(r.system.startsWith('SYS')).toBe(true);
    expect(r.system).toContain('`gap_report`');
    expect(r.tools).toEqual([{ name: 'gap_report' }]);
  });

  it('labels every model alias', () => {
    for (const alias of Object.keys(defaultDraftingConfig.models)) {
      expect(defaultDraftingConfig.modelLabels?.[alias]).toBeTruthy();
    }
  });
});
