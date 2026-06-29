import type { DomainPack, LlmsTxtConfig } from '@jeldon/config';
import type { Writer } from './types.js';

/** No-op writer — the default. `emitLlmsTxt` returns the rendered string
 *  regardless; the writer only matters when a host wants the file on disk. */
export const NullWriter: Writer = { write() {} };

/** Convenience Node writer. Kept lazy (dynamic import) so importing this module
 *  in a browser/edge build never pulls in `node:fs`. */
export function fsWriter(): Writer {
  return {
    async write(path: string, contents: string) {
      const { writeFile, mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents, 'utf8');
    },
  };
}

/**
 * Render the llms.txt content (llmstxt.org convention) for a Domain Pack.
 *
 * Ported from BoH `public/llms.txt` (a hand-authored static file). The
 * mechanics (markdown structure: H1 brand name, summary blockquote, intro,
 * `## Section` headers with `- [label](url): note` bullets) are the engine's;
 * every domain string (the most-cited URLs, scope/policy prose, service area)
 * is config — `pack.schema.llmsTxt`. Generic by default: a pack that sets
 * `emitLlmsTxt: false` (the default) or omits `llmsTxt` renders only the H1 +
 * summary derived from `brand`.
 */
export function renderLlmsTxt(input: { brandName: string; summary?: string } & LlmsTxtConfig): string {
  const out: string[] = [];
  out.push(`# ${input.brandName}`);
  out.push('');
  if (input.summary) {
    out.push(`> ${input.summary}`);
    out.push('');
  }
  if (input.intro) {
    out.push(input.intro.trim());
    out.push('');
  }
  for (const section of input.sections ?? []) {
    out.push(`## ${section.heading}`);
    out.push('');
    for (const item of section.items) {
      if (typeof item === 'string') {
        out.push(item.startsWith('-') ? item : `- ${item}`);
      } else {
        const link = item.url ? `[${item.label}](${item.url})` : item.label;
        out.push(item.note ? `- ${link}: ${item.note}` : `- ${link}`);
      }
    }
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export interface EmitLlmsTxtResult {
  /** The rendered file contents (empty string when emission is disabled). */
  contents: string;
  /** Whether the pack opted into emission (`pack.schema.emitLlmsTxt`). */
  emitted: boolean;
}

/**
 * Build (and optionally write) `llms.txt` for a Domain Pack. Cheap-to-emit,
 * never a ranking pillar — gated on `pack.schema.emitLlmsTxt` (default false).
 * I/O goes through `Writer` (NullWriter default), per the DECOUPLING-NOTES rule.
 */
export async function emitLlmsTxt(
  pack: DomainPack,
  opts: { writer?: Writer; outPath?: string } = {},
): Promise<EmitLlmsTxtResult> {
  if (!pack.schema.emitLlmsTxt) {
    return { contents: '', emitted: false };
  }
  const cfg = pack.schema.llmsTxt ?? {};
  const contents = renderLlmsTxt({
    brandName: pack.schema.org.name || pack.brand.name,
    summary: cfg.summary ?? pack.brand.tagline,
    intro: cfg.intro,
    sections: cfg.sections,
  });
  const writer = opts.writer ?? NullWriter;
  const outPath = opts.outPath ?? 'public/llms.txt';
  await writer.write(outPath, contents);
  return { contents, emitted: true };
}
