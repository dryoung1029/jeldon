/** Web-Crypto SHA-256 helpers. `crypto.subtle` is present in CF Workers,
 *  modern Node (global `crypto`), and browsers — no node:crypto import, so the
 *  package stays isomorphic and needs no @types/node. */

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text).buffer as ArrayBuffer);
}

/** Concatenate MP3 byte buffers. Browsers/players treat the joined stream as a
 *  single track — exactly the BoH chunk-join behavior. */
export function concatBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), offset);
    offset += p.byteLength;
  }
  return out.buffer;
}
