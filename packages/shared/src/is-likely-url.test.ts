import { describe, it, expect } from 'vitest';
import { isLikelyUrl } from './is-likely-url.js';

describe('isLikelyUrl', () => {
  it('returns true for https:// URLs', () => {
    expect(isLikelyUrl('https://github.com/foo')).toBe(true);
  });

  it('returns true for http:// URLs', () => {
    expect(isLikelyUrl('http://example.com')).toBe(true);
  });

  it('returns false for issue tracker IDs like PROJ-123', () => {
    expect(isLikelyUrl('PROJ-123')).toBe(false);
  });

  it('returns false for mailto: URLs', () => {
    expect(isLikelyUrl('mailto:a@b.com')).toBe(false);
  });

  it('returns false for javascript: URLs', () => {
    expect(isLikelyUrl('javascript:alert(1)')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isLikelyUrl('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isLikelyUrl('   ')).toBe(false);
  });

  it('returns true for https URLs with complex paths', () => {
    expect(isLikelyUrl('https://github.com/user/repo/issues/123')).toBe(true);
  });

  it('returns true for http URLs with query params', () => {
    expect(isLikelyUrl('http://example.com/path?key=value')).toBe(true);
  });

  it('normalizes uppercase schemes (HTTPS://Example.com)', () => {
    expect(isLikelyUrl('HTTPS://Example.com')).toBe(true);
  });

  it('normalizes single-slash URLs like https:/foo to https://foo/', () => {
    // new URL normalizes single slash to //, so 'https:/foo' becomes 'https://foo/'.
    // This is valid and isLikelyUrl returns true.
    expect(isLikelyUrl('https:/foo')).toBe(true);
  });

  it('returns false for scheme-only strings (https://)', () => {
    // new URL throws for empty host; isLikelyUrl catches and returns false.
    expect(isLikelyUrl('https://')).toBe(false);
  });

  it('returns true for URLs with parentheses in path', () => {
    expect(isLikelyUrl('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe(true);
  });
});
