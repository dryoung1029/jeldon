import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/init/render.js';

describe('renderTemplate', () => {
  it('substitutes, handles if/unless/eq and nesting, reports missing vars', () => {
    const src = 'Hi {{name}}.{{#if hipaa}} PHI rules.{{/if}}{{#unless hipaa}} Plain.{{/unless}} {{#eq crm "pushpress"}}PP{{#if sub}}({{sub}}){{/if}}{{/eq}}{{#eq crm "none"}}none{{/eq}} {{nope}}';
    const r = renderTemplate(src, { name: 'Kathy', hipaa: false, crm: 'pushpress', sub: 'helix' });
    expect(r.text).toBe('Hi Kathy. Plain. PP(helix) ');
    expect(r.missing).toEqual(['nope']);
    expect(renderTemplate(src, { name: 'Doc', hipaa: true, crm: 'none' }).text).toBe('Hi Doc. PHI rules. none ');
  });
});
