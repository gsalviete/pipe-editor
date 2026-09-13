import {
  appendBoundedOutput,
  MAX_CAPTURED_STREAM_CHARS,
  OUTPUT_TRUNCATION_MARKER,
} from './docker-client';

describe('bounded executor output (PRODUCT-AC-008)', () => {
  it('keeps ordinary output byte-identical', () => {
    expect(appendBoundedOutput('hello ', 'world')).toBe('hello world');
  });

  it('caps oversized output, marks truncation and retains the latest tail', () => {
    const first = 'a'.repeat(MAX_CAPTURED_STREAM_CHARS);
    const result = appendBoundedOutput(first, 'important-tail');

    expect(result).toHaveLength(MAX_CAPTURED_STREAM_CHARS);
    expect(result.startsWith(OUTPUT_TRUNCATION_MARKER)).toBe(true);
    expect(result.endsWith('important-tail')).toBe(true);
  });
});
