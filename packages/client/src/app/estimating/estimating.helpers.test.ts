/**
 * Tests for the pure helpers behind EstimatingPage.
 *
 * The unanimous auto-reveal predicate lives in `@hnch/shared`
 * (`shouldAutoReveal`); its test surface is `packages/shared/src/auto-reveal.test.ts`.
 * The page's own wiring is covered in estimating.page.effects.test.ts and
 * estimating.page.keyboard.test.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  buildCancelledRoundToast,
  buildEstimatingTitle,
  parseTicketIdHref,
} from './estimating.helpers';

describe('parseTicketIdHref', () => {
  it('returns null for undefined', () => {
    expect(parseTicketIdHref(undefined)).toBeNull();
  });
  it('returns null for null', () => {
    expect(parseTicketIdHref(null)).toBeNull();
  });
  it('returns null for non-URL plain ticket id', () => {
    expect(parseTicketIdHref('PROJ-1234')).toBeNull();
  });
  it('returns url for https', () => {
    expect(parseTicketIdHref('https://x.com')).toBe('https://x.com');
  });
  it('returns url for http', () => {
    expect(parseTicketIdHref('http://x')).toBe('http://x');
  });
  it('rejects javascript: scheme', () => {
    expect(parseTicketIdHref('javascript:alert(1)')).toBeNull();
  });
  it('rejects ftp:', () => {
    expect(parseTicketIdHref('ftp://x')).toBeNull();
  });
  it('trims whitespace and returns trimmed url', () => {
    expect(parseTicketIdHref('  https://x  ')).toBe('https://x');
  });
  it('returns null for malformed "http://"', () => {
    expect(parseTicketIdHref('http://')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(parseTicketIdHref('')).toBeNull();
  });
});

describe('buildEstimatingTitle', () => {
  it('names the round by its number in the session', () => {
    expect(buildEstimatingTitle(1)).toBe('Round 1');
    expect(buildEstimatingTitle(12)).toBe('Round 12');
  });

  it('falls back to the screen name until the round shows up', () => {
    expect(buildEstimatingTitle(null)).toBe('Estimating');
  });
});

describe('buildCancelledRoundToast', () => {
  it('confirms to the host what their tap did', () => {
    expect(buildCancelledRoundToast(true)).toBe('Round cancelled');
  });

  it('tells everyone else who did it', () => {
    expect(buildCancelledRoundToast(false)).toBe('The host cancelled the round');
  });
});
