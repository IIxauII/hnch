import { describe, it, expect } from 'vitest';
import { keyBetween } from './fractional-index.js';

// ---------------------------------------------------------------------------
// Null / null — initial key
// ---------------------------------------------------------------------------

describe('keyBetween(null, null)', () => {
  it('returns a stable non-empty key', () => {
    const k = keyBetween(null, null);
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });

  it('is idempotent across calls', () => {
    expect(keyBetween(null, null)).toBe(keyBetween(null, null));
  });
});

// ---------------------------------------------------------------------------
// Append — keyBetween(a, null)
// ---------------------------------------------------------------------------

describe('keyBetween(a, null) — append', () => {
  it('returns key strictly after a', () => {
    const a = keyBetween(null, null);
    const k = keyBetween(a, null);
    expect(k > a).toBe(true);
  });

  it('can append repeatedly without collision', () => {
    let prev = keyBetween(null, null);
    const keys: string[] = [prev];
    for (let i = 0; i < 20; i++) {
      const next = keyBetween(prev, null);
      expect(next > prev).toBe(true);
      keys.push(next);
      prev = next;
    }
    // All unique.
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ---------------------------------------------------------------------------
// Prepend — keyBetween(null, b)
// ---------------------------------------------------------------------------

describe('keyBetween(null, b) — prepend', () => {
  it('returns key strictly before b', () => {
    const b = keyBetween(null, null);
    const k = keyBetween(null, b);
    expect(k < b).toBe(true);
  });

  it('can prepend repeatedly without collision', () => {
    let next = keyBetween(null, null);
    const keys: string[] = [next];
    for (let i = 0; i < 10; i++) {
      const prev = keyBetween(null, next);
      expect(prev < next).toBe(true);
      keys.push(prev);
      next = prev;
    }
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ---------------------------------------------------------------------------
// Midpoint — keyBetween(a, b)
// ---------------------------------------------------------------------------

describe('keyBetween(a, b) — midpoint', () => {
  it('returns key strictly between a and b', () => {
    const a = 'a0';
    // b is the append of a — keyBetween(a, null)
    const b = keyBetween(a, null);
    const mid = keyBetween(a, b);
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('works for well-separated bounds', () => {
    const a = 'a0';
    const b = 'z0';
    const mid = keyBetween(a, b);
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('throws when a >= b', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('a', 'a')).toThrow();
  });

  it('produces distinct keys on repeated mid-inserts between same pair', () => {
    // Consecutive left-side insertions are the worst case for lex fractional
    // keys — the space halves each step. With a 4-mid-char initial append gap
    // (~BASE⁴ levels), ~20 consecutive left-side insertions are safe.
    let a = keyBetween(null, null);
    let b = keyBetween(a, null);
    const keys = new Set<string>([a, b]);
    for (let i = 0; i < 20; i++) {
      const mid = keyBetween(a, b);
      expect(mid > a).toBe(true);
      expect(mid < b).toBe(true);
      expect(keys.has(mid)).toBe(false);
      keys.add(mid);
      // Stress left-side: each iteration narrows the right bound.
      b = mid;
    }
  });
});

// ---------------------------------------------------------------------------
// Lexicographic ordering invariant
// ---------------------------------------------------------------------------

describe('lexicographic ordering invariant', () => {
  it('building an append-only list produces keys in insertion order', () => {
    const keys: string[] = [];
    let prev: string | null = null;
    for (let i = 0; i < 50; i++) {
      const k = keyBetween(prev, null);
      keys.push(k);
      prev = k;
    }
    const sorted = [...keys].toSorted();
    expect(sorted).toEqual(keys);
  });

  it('building a prepend-only list produces keys in reverse insertion order', () => {
    const keys: string[] = [];
    let next: string | null = null;
    for (let i = 0; i < 20; i++) {
      const k = keyBetween(null, next);
      keys.push(k);
      next = k;
    }
    // The first prepended key should be the largest.
    const sorted = [...keys].toSorted().toReversed();
    expect(sorted).toEqual(keys);
  });

  it('inserting between two adjacent list items maintains sorted order', () => {
    // Build [k0, k1, k2, k3, k4].
    const list: string[] = [keyBetween(null, null)];
    for (let i = 0; i < 4; i++) list.push(keyBetween(list.at(-1)!, null));

    // Insert between index 1 and 2.
    const ins = keyBetween(list[1]!, list[2]!);
    list.splice(2, 0, ins);

    const sorted = [...list].toSorted();
    expect(sorted).toEqual(list);
  });
});

// ---------------------------------------------------------------------------
// Never returns equal-to-bound key
// ---------------------------------------------------------------------------

describe('never returns equal-to-bound key', () => {
  it('append key !== a', () => {
    const a = 'a0';
    expect(keyBetween(a, null)).not.toBe(a);
  });

  it('prepend key !== b', () => {
    const b = 'a0';
    // keyBetween(null, b) should not equal b.
    expect(keyBetween(null, b)).not.toBe(b);
  });

  it('midpoint key !== a and !== b over 20 iterations', () => {
    // Consecutive left-side insertions halve the lex space each step.
    // 20 iterations is the safe bound for a 4-char initial append gap.
    const a = keyBetween(null, null);
    let b = keyBetween(a, null);
    for (let i = 0; i < 20; i++) {
      const mid = keyBetween(a, b);
      expect(mid).not.toBe(a);
      expect(mid).not.toBe(b);
      b = mid;
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles single-character bounds', () => {
    const mid = keyBetween('A', 'z');
    expect(mid > 'A').toBe(true);
    expect(mid < 'z').toBe(true);
  });

  it('handles long keys', () => {
    // Build a very long key by repeated appends.
    let k = keyBetween(null, null);
    for (let i = 0; i < 50; i++) k = keyBetween(k, null);
    const next = keyBetween(k, null);
    expect(next > k).toBe(true);
  });

  it('covers _keyBefore all-zeros path (keyBetween(null, "00"))', () => {
    // "00" has all-zero digits; decrement walks the whole string without
    // finding a non-zero digit, triggering the strip-last-char fallback.
    const k = keyBetween(null, '00');
    expect(k < '00').toBe(true);
  });

  it('throws when keyBetween(null, "0") — minimum possible key', () => {
    // "0" is the minimum character in our alphabet, so no key is smaller.
    expect(() => keyBetween(null, '0')).toThrow();
  });

  it('throws when keyBetween(a, b) with a >= b', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('z', 'z')).toThrow();
  });

  it('covers _deepBetween for adjacent single-char keys (a="A", b="B")', () => {
    // 'A'=10, 'B'=11 — adjacent digits. Arithmetic midpoint = 'A' (same as lower bound).
    // Should trigger _deepBetween and produce something between them.
    const mid = keyBetween('A', 'B');
    expect(mid > 'A').toBe(true);
    expect(mid < 'B').toBe(true);
  });

  it('covers _deepBetween for longer adjacent keys', () => {
    // "a0" and "a1" — adjacent at position 1.
    const mid = keyBetween('a0', 'a1');
    expect(mid > 'a0').toBe(true);
    expect(mid < 'a1').toBe(true);
  });

  it('covers _deepBetween gap > 1 path', () => {
    // "a0" and "a3" — gap of 3 at position 1, divisible to midpoint.
    const mid = keyBetween('a0', 'a3');
    expect(mid > 'a0').toBe(true);
    expect(mid < 'a3').toBe(true);
  });

  it('covers _deepBetween when a is exhausted with bv > 1', () => {
    // "a" and "aB" — a is exhausted at i=1, bv = dv("B") = 11 > 1.
    const mid = keyBetween('a', 'aB');
    expect(mid > 'a').toBe(true);
    expect(mid < 'aB').toBe(true);
  });

  it('covers _deepBetween when a is exhausted with bv == 1', () => {
    // "a" and "a1" — a is exhausted at i=1, bv = dv("1") = 1.
    const mid = keyBetween('a', 'a1');
    expect(mid > 'a').toBe(true);
    expect(mid < 'a1').toBe(true);
  });

  it('covers _between trimmed path returning canonical form', () => {
    // Wide gap: arithmetic midpoint has trailing zeros that can be trimmed.
    // "0" and "z": midpoint should be something around the middle with no trailing zeros.
    const mid = keyBetween('0', 'z');
    expect(mid > '0').toBe(true);
    expect(mid < 'z').toBe(true);
  });
});
