// T-STATE-011 (STATE-AC-011) — share-link encoding.
//
// The old pair was `btoa(unescape(encodeURIComponent(s)))` and its inverse:
// working, but built on two functions deprecated for twenty years that
// operate on UTF-16 code units (adversarial review FE-04).

import { describe, expect, it } from 'vitest';
import { decodeShareHash, encodeShareHash } from './share-link';

describe('T-STATE-011 — share-link round trip', () => {
  it.each([
    ['ascii', '{"project":{"name":"demo-api"}}'],
    ['accented', '{"name":"café-serviço"}'],
    ['cjk', '{"name":"パイプライン"}'],
    ['emoji', '{"note":"ship it 🚀🎉"}'],
    ['rtl', '{"name":"مشروع"}'],
    ['quotes and backslashes', '{"run":"echo \\"a\\\\b\\""}'],
    ['newlines', '{"run":"# install\\nnpm ci\\nnpm test"}'],
    ['empty object', '{}'],
  ])('round-trips %s', (_label, json) => {
    expect(decodeShareHash(encodeShareHash(json))).toBe(json);
  });

  it('round-trips a large document without hitting the argument limit', () => {
    // String.fromCharCode(...bytes) throws above ~64k arguments; the
    // encoder chunks for exactly this case.
    const json = JSON.stringify({ run: 'x'.repeat(400_000) });
    expect(decodeShareHash(encodeShareHash(json))).toBe(json);
  });

  it('produces URL-safe output — no +, / or = to be mangled in a fragment', () => {
    const json = JSON.stringify({ bytes: 'ÿþýü?>?>' });
    const encoded = encodeShareHash(json);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeShareHash(encoded)).toBe(json);
  });

  it('throws on a corrupted fragment rather than returning half a document', () => {
    expect(() => decodeShareHash('!!!not base64!!!')).toThrow();
    // Valid base64url, invalid UTF-8 — `fatal` decoding must reject it
    // instead of yielding replacement characters inside JSON.
    expect(() => decodeShareHash('_w')).toThrow();
  });
});
