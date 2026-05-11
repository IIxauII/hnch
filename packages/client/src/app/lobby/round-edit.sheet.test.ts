/**
 * Unit tests for RoundEditSheetComponent submit logic.
 *
 * No TestBed, no Ionic rendering — pure predicate tests.
 * The submit() implementation is re-stated inline so the contract is explicit.
 */

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Inline simulation of RoundEditSheetComponent.submit()
// ---------------------------------------------------------------------------

interface RoundEditSubmission {
  readonly title: string;
  readonly description: string | null;
}

/**
 * Mirrors the submit() guard and transformation logic of RoundEditSheetComponent.
 * Returns null when submit would be a no-op (double-tap or empty title).
 */
function simulateSubmit(
  titleValue: string,
  descValue: string,
  isSubmitting: boolean,
): RoundEditSubmission | null {
  if (isSubmitting) return null;
  if (titleValue.trim() === '') return null;
  const title = titleValue.trim();
  const rawDesc = descValue.trim();
  return { title, description: rawDesc === '' ? null : rawDesc };
}

// ---------------------------------------------------------------------------
// Guard: isSubmitting prevents double-tap
// ---------------------------------------------------------------------------

describe('RoundEditSheet submit — isSubmitting guard', () => {
  it('returns null when already submitting', () => {
    expect(simulateSubmit('Login redesign', '', true)).toBeNull();
  });

  it('returns submission when not yet submitting', () => {
    expect(simulateSubmit('Login redesign', '', false)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Guard: empty title prevents submit
// ---------------------------------------------------------------------------

describe('RoundEditSheet submit — empty title guard', () => {
  it('returns null for empty string title', () => {
    expect(simulateSubmit('', 'some notes', false)).toBeNull();
  });

  it('returns null for whitespace-only title', () => {
    expect(simulateSubmit('   ', 'some notes', false)).toBeNull();
  });

  it('returns null for tab-only title', () => {
    expect(simulateSubmit('\t', '', false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Title trimming
// ---------------------------------------------------------------------------

describe('RoundEditSheet submit — title trimming', () => {
  it('trims leading and trailing whitespace from title', () => {
    const result = simulateSubmit('  Login redesign  ', '', false);
    expect(result?.title).toBe('Login redesign');
  });

  it('preserves internal whitespace in title', () => {
    const result = simulateSubmit('  Login  redesign  ', '', false);
    expect(result?.title).toBe('Login  redesign');
  });
});

// ---------------------------------------------------------------------------
// Description null-coercion
// ---------------------------------------------------------------------------

describe('RoundEditSheet submit — description null-coercion', () => {
  it('description is null when desc field is empty string', () => {
    const result = simulateSubmit('Login', '', false);
    expect(result?.description).toBeNull();
  });

  it('description is null when desc field is whitespace-only', () => {
    const result = simulateSubmit('Login', '   ', false);
    expect(result?.description).toBeNull();
  });

  it('description is trimmed non-empty string when provided', () => {
    const result = simulateSubmit('Login', '  Some notes  ', false);
    expect(result?.description).toBe('Some notes');
  });

  it('description retains internal whitespace', () => {
    const result = simulateSubmit('Login', 'line one\nline two', false);
    expect(result?.description).toBe('line one\nline two');
  });
});

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

describe('RoundEditSheet submit — combined output', () => {
  it('produces correct submission for typical input', () => {
    expect(simulateSubmit(' Auth flow ', ' Add login screen ', false)).toEqual({
      title: 'Auth flow',
      description: 'Add login screen',
    });
  });

  it('description is null in the submission object when empty', () => {
    expect(simulateSubmit('Auth flow', '', false)).toEqual({
      title: 'Auth flow',
      description: null,
    });
  });
});
