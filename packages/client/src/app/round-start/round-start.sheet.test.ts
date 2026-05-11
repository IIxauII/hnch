/**
 * Unit tests for RoundStartSheetComponent submit logic.
 *
 * No TestBed, no Ionic rendering — pure predicate tests.
 * The submit() implementation is re-stated inline so the contract is explicit.
 *
 * Key difference from RoundEditSheet: Start is always enabled (descriptor is
 * optional), so an empty title produces { title: null } rather than a no-op.
 */

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Inline simulation of RoundStartSheetComponent.submit()
// ---------------------------------------------------------------------------

interface RoundStartSubmission {
  readonly title: string | null;
}

/**
 * Mirrors RoundStartSheetComponent.submit().
 * Returns null only when the isSubmitting latch is already set.
 */
function simulateSubmit(titleValue: string, isSubmitting: boolean): RoundStartSubmission | null {
  if (isSubmitting) return null;
  const raw = titleValue.trim();
  return { title: raw === '' ? null : raw };
}

// ---------------------------------------------------------------------------
// Guard: isSubmitting latch prevents double-tap
// ---------------------------------------------------------------------------

describe('RoundStartSheet submit — isSubmitting latch', () => {
  it('returns null when already submitting', () => {
    expect(simulateSubmit('Login redesign', true)).toBeNull();
  });

  it('proceeds when not yet submitting', () => {
    expect(simulateSubmit('Login redesign', false)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Title: empty / whitespace → null (descriptor is optional)
// ---------------------------------------------------------------------------

describe('RoundStartSheet submit — empty title produces null title', () => {
  it('empty string title → { title: null }', () => {
    expect(simulateSubmit('', false)).toEqual({ title: null });
  });

  it('whitespace-only title → { title: null }', () => {
    expect(simulateSubmit('   ', false)).toEqual({ title: null });
  });

  it('tab-only title → { title: null }', () => {
    expect(simulateSubmit('\t', false)).toEqual({ title: null });
  });
});

// ---------------------------------------------------------------------------
// Title trimming
// ---------------------------------------------------------------------------

describe('RoundStartSheet submit — title trimming', () => {
  it('trims leading and trailing whitespace', () => {
    expect(simulateSubmit('  Login redesign  ', false)).toEqual({ title: 'Login redesign' });
  });

  it('preserves internal whitespace', () => {
    expect(simulateSubmit('Login  flow', false)).toEqual({ title: 'Login  flow' });
  });
});

// ---------------------------------------------------------------------------
// Normal submission
// ---------------------------------------------------------------------------

describe('RoundStartSheet submit — normal submission', () => {
  it('non-empty title is returned as-is (trimmed)', () => {
    expect(simulateSubmit('Auth refactor', false)).toEqual({ title: 'Auth refactor' });
  });
});
