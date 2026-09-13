// Share-link encoding (STATE-FR-014/FR-015).
//
// A share link carries the whole canonical IR in the URL **fragment**, so
// it works with no server state — and, more importantly, so the payload is
// never sent to a server: fragments do not appear in request lines, access
// logs, referrer headers or proxy caches. For a payload that is a shell
// script that is the whole point. See ADR-0016.
//
// FE-04 — the encoding used `btoa(unescape(encodeURIComponent(s)))` and its
// inverse. That pair works, and `escape`/`unescape` have been deprecated
// for two decades: they are defined in Annex B, they operate on UTF-16 code
// units, and they survive only because the web cannot break old pages.
// `TextEncoder` says what is actually meant — UTF-8 bytes — instead of
// arriving there through a chain of coincidences.
//
// base64url (RFC 4648 §5) rather than plain base64: `+` and `/` are legal
// in a fragment but `+` is widely mangled by tools that treat fragments as
// query strings, and `=` padding is noise in a URL.

/** Encode a canonical IR JSON string for a `#ir=` fragment. */
export function encodeShareHash(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  // String.fromCharCode(...bytes) blows the argument limit on a large IR,
  // so accumulate in chunks.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a `#ir=` fragment back to its JSON string.
 *
 * Throws on anything that is not valid base64url of valid UTF-8; the caller
 * reports a corrupted link rather than loading a half-decoded document.
 */
export function decodeShareHash(hash: string): string {
  const base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // `fatal` so malformed UTF-8 throws instead of yielding replacement
  // characters inside what will be parsed as JSON.
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
