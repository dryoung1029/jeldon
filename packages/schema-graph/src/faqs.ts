import type { Faq, JsonLd } from './types.js';

/**
 * Extracts Q&A pairs from article markdown. Treats any H2 that ends with "?"
 * or starts with a question word as a question; the first paragraph of body
 * text that follows is the answer. Strips inline markdown formatting from the
 * answer so the JSON-LD reads as plain prose.
 *
 * Ported VERBATIM from Body of Health `src/lib/schema.ts::extractFaqs` — it is
 * fully portable (no domain literals, no I/O). The question-starter set is
 * language-general English; if a project needs another language, it can map
 * the output, but the mechanics are untouched.
 */
export function extractFaqs(body: string): Faq[] {
  const lines = body.split(/\r?\n/);
  const questionStart =
    /^(why|what|how|should|is|are|can|could|do|does|did|will|would|when|where|who)\b/i;
  const faqs: Faq[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^##\s+(.+?)\s*$/);
    if (!m) continue;
    const q = m[1]!.trim();
    if (!(q.endsWith('?') || questionStart.test(q))) continue;

    const answerLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (/^#{1,6}\s/.test(line)) break; // next heading ends the answer
      if (/^```/.test(line)) break; // code fence — skip
      if (line.trim() === '') {
        if (answerLines.length > 0) break; // first paragraph only
        continue;
      }
      answerLines.push(line.trim());
    }
    if (answerLines.length === 0) continue;

    // Strip markdown: links → text, bold/italic/code markers, image refs.
    const a = answerLines
      .join(' ')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
      .replace(/[*_`]/g, '') // emphasis markers
      .replace(/\s+/g, ' ')
      .trim();
    if (!a) continue;
    faqs.push({ q, a });
  }
  return faqs;
}

export function faqPage(faqs: Faq[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
