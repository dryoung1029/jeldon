/** Base64 / base64url helpers that work in Workers, browsers and Node 18+
 *  (all expose `btoa` / `atob`). */

export function bytesToBinary(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return bin;
}

export function base64(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes));
}

export function base64Utf8(s: string): string {
  return base64(new TextEncoder().encode(s));
}

/** URL-safe base64 without padding (JWT segments, Gmail `raw`). */
export function base64url(input: Uint8Array | string): string {
  const b64 = typeof input === 'string' ? base64Utf8(input) : base64(input);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64urlDecodeUtf8(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(base64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
}
