/**
 * Plain text → safe HTML. The admin types plain text; nothing they type can
 * become markup. Everything is escaped; only `https://` URLs and email
 * addresses become links. `javascript:`, `data:`, plain `http://` and any
 * HTML stay inert text. Blank lines become paragraph breaks, single newlines
 * `<br>`.
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

// Scanned on the RAW text, so a link's href is built from characters that
// cannot close the attribute or open a tag. An email must start the text or
// follow whitespace / "(", so an address inside a URL stays part of the URL.
const TOKEN_RE =
  /(https:\/\/[^\s<>"'`]+)|(^|[\s(])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

function linkify(para: string): string {
  let out = '';
  let last = 0;
  for (const m of para.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (m[1]) {
      let url = m[1];
      const trail = TRAILING_PUNCT.exec(url)?.[0] ?? '';
      url = url.slice(0, url.length - trail.length);
      if (url.length <= 'https://'.length) continue;
      out += escapeHtml(para.slice(last, start));
      const u = escapeHtml(url);
      out += `<a href="${u}" rel="noopener">${u}</a>`;
      last = start + url.length;
    } else if (m[3]) {
      const pre = m[2] ?? '';
      const addr = m[3];
      out += escapeHtml(para.slice(last, start) + pre);
      const a = escapeHtml(addr);
      out += `<a href="mailto:${a}">${a}</a>`;
      last = start + pre.length + addr.length;
    }
  }
  out += escapeHtml(para.slice(last));
  return out.replace(/\n/g, '<br>');
}

export function messageHtml(text: string): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n\s*\n/)
    .map((para) => linkify(para.trim()))
    .join('<br><br>');
}
