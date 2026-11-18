import { base64, base64Utf8, base64url } from './encoding.js';

/**
 * Raw RFC 5322 message building for the Gmail `messages.send` API.
 *
 * Two bugs this exists to make impossible:
 *
 * 1. HEADER INJECTION. Names and reply-to addresses come straight off public
 *    forms. A value carrying a newline turns the rest of the line into a header
 *    of the sender's choosing ("Bcc: someone-else"). Every header value is
 *    flattened (CR/LF → space) before it goes near a header.
 * 2. THE EMPTY EMAIL. Body Of Health built `headers.join('\r\n') + body` with a
 *    body that started with a single CRLF, so there was one line break between
 *    the last header and the first body line instead of the blank line RFC 5322
 *    requires. Gmail parsed the body as a header continuation and every email
 *    arrived empty. Here the headers block and body are always joined with
 *    exactly `\r\n\r\n`, in one place.
 */

export type MailAddress = string | { name?: string; email: string };

export interface MailAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface RawEmailInput {
  from: MailAddress;
  to: MailAddress | MailAddress[];
  replyTo?: MailAddress;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  /** Boundary seed; injectable for deterministic tests. */
  boundary?: string;
}

/** Strip CR/LF (and other control characters) from a header value. */
export function flattenHeader(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return String(raw ?? '').replace(/[\r\n]+/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

const ENCODED_WORD_MAX_BYTES = 45; // 60 base64 chars + 12 framing ≤ 75 (RFC 2047 §2)

/**
 * RFC 2047 encoded-word(s) for a non-ASCII value; ASCII passes through. Long
 * values are split into several encoded-words on code-point boundaries, each
 * ≤ 75 characters, separated by a space (adjacent encoded-words are joined
 * without the space by decoders). Standard base64 WITH padding: BoH reused its
 * base64url helper here, which dropped the `=` padding the B encoding needs.
 */
export function encodeHeaderWord(raw: string): string {
  const flat = flattenHeader(raw);
  if (!/[^\x20-\x7E]/.test(flat)) return flat;
  const enc = new TextEncoder();
  const words: string[] = [];
  let chunk = '';
  let chunkBytes = 0;
  for (const ch of flat) {
    const n = enc.encode(ch).length;
    if (chunkBytes + n > ENCODED_WORD_MAX_BYTES && chunk) {
      words.push(`=?UTF-8?B?${base64Utf8(chunk)}?=`);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += n;
  }
  if (chunk) words.push(`=?UTF-8?B?${base64Utf8(chunk)}?=`);
  return words.join(' ');
}

/** `Name <email>` with the address reduced to its bare form and the name
 *  quoted (ASCII) or encoded (non-ASCII). */
export function formatAddress(addr: MailAddress): string {
  const { name, email } = typeof addr === 'string' ? { name: undefined, email: addr } : addr;
  const bare = flattenHeader(email).replace(/[\s<>",;]/g, '');
  const n = name ? flattenHeader(name) : '';
  if (!n) return bare;
  const display = /[^\x20-\x7E]/.test(n) ? encodeHeaderWord(n) : `"${n.replace(/(["\\])/g, '\\$1')}"`;
  return `${display} <${bare}>`;
}

function b64Lines(bytes: Uint8Array): string {
  return base64(bytes).replace(/(.{76})/g, '$1\r\n');
}

function randomToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Build the RFC 5322 message as a string (CRLF line endings). */
export function buildMimeMessage(input: RawEmailInput): string {
  const seed = flattenHeader(input.boundary ?? randomToken()).replace(/[^\w.-]/g, '');
  const alt = `alt-${seed}`;
  const mixed = `mixed-${seed}`;
  const toList = (Array.isArray(input.to) ? input.to : [input.to]).map(formatAddress).join(', ');

  const headers = [
    `From: ${formatAddress(input.from)}`,
    `To: ${toList}`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    'MIME-Version: 1.0',
  ];
  if (input.replyTo) headers.push(`Reply-To: ${formatAddress(input.replyTo)}`);

  // The readable part.
  let partHeaders: string[];
  let partBody: string;
  if (input.html) {
    partHeaders = [`Content-Type: multipart/alternative; boundary="${alt}"`];
    partBody = [
      `--${alt}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      input.text,
      `--${alt}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      input.html,
      `--${alt}--`,
      '',
    ].join('\r\n');
  } else {
    partHeaders = ['Content-Type: text/plain; charset="UTF-8"'];
    partBody = input.text;
  }

  const attachments = input.attachments ?? [];
  let body: string;
  if (attachments.length) {
    headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
    const parts = [`--${mixed}`, ...partHeaders, '', partBody];
    for (const a of attachments) {
      const fname = encodeHeaderWord(a.filename).replace(/"/g, '');
      parts.push(
        `--${mixed}`,
        `Content-Type: ${flattenHeader(a.contentType)}; name="${fname}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${fname}"`,
        '',
        b64Lines(a.bytes),
      );
    }
    parts.push(`--${mixed}--`, '');
    body = parts.join('\r\n');
  } else {
    headers.push(...partHeaders);
    body = partBody;
  }

  // The one place headers meet the body: exactly one blank line.
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

/** The message as Gmail's `raw` field wants it: base64url of the UTF-8 bytes. */
export function buildRawEmail(input: RawEmailInput): string {
  return base64url(buildMimeMessage(input));
}

export interface SendRawEmailOptions {
  accessToken: string;
  raw: string;
  /** Gmail user id; `me` means the token's subject. */
  userId?: string;
  fetch?: typeof fetch;
}

/** POST a raw message to Gmail. Returns a result, never throws on HTTP errors. */
export async function sendRawEmail(
  opts: SendRawEmailOptions,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  const doFetch = opts.fetch ?? fetch;
  try {
    const res = await doFetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(opts.userId ?? 'me')}/messages/send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: opts.raw }),
      },
    );
    if (!res.ok) return { ok: false, status: res.status, error: `Gmail ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? '' };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
