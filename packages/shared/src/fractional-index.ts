/**
 * Lightweight fractional-index utility for collision-free list reordering.
 *
 * Keys are variable-length strings over the alphabet `[0-9A-Za-z]` (base-62,
 * digits 0–61 → chars '0'–'9','A'–'Z','a'–'z'). Ordering is plain JS `<`
 * string comparison.
 *
 * Design rules:
 *  - Every generated key ends with at least one non-'0' suffix digit, so
 *    there is always room to insert a new key just before it (avoid the
 *    "adjacent to floor" problem).
 *  - `keyBetween(a, null)` appends FOUR mid-range digits to `a` so that
 *    roughly BASE⁴ ≈ 14.8M insertion-point levels are available, which
 *    supports ~24 consecutive worst-case left-side insertions before the
 *    lex-adjacency floor is reached. Practical usage (balanced inserts)
 *    will never exhaust this.
 *  - `keyBetween(null, null)` returns a stable midpoint with room on both sides.
 *
 * @throws when `a >= b` (both non-null), or when the space between `a`
 *   and `b` is genuinely exhausted (requires many consecutive same-side
 *   insertions against the exact same bounds).
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const MID = Math.floor(BASE / 2);

/** Parse a base-62 digit character to 0–61. */
function dv(ch: string): number {
  const v = DIGITS.indexOf(ch);
  if (v === -1) throw new Error(`fractional-index: invalid character '${ch}'`);
  return v;
}

/** Right-pad `s` with '0' to length `len`. */
function pad(s: string, len: number): string {
  return s.length >= len ? s : s + '0'.repeat(len - s.length);
}

/** Strip trailing '0' digits, preserving at least 1 character. */
function trim0(s: string): string {
  let i = s.length - 1;
  while (i > 0 && s[i] === '0') i--;
  return s.slice(0, i + 1);
}

/**
 * Arithmetic midpoint of two equal-length base-62 digit arrays.
 * Returns a digit array of the same length.
 */
function midDigits(a: number[], b: number[]): number[] {
  const len = a.length;
  // Compute a + b (base-62).
  const sum = Array.from<number>({ length: len + 1 }).fill(0);
  let carry = 0;
  for (let i = len - 1; i >= 0; i--) {
    const s = a[i]! + b[i]! + carry;
    sum[i + 1] = s % BASE;
    carry = Math.floor(s / BASE);
  }
  sum[0] = carry;

  // Halve (divide by 2) — treat leading carry as extra digit.
  const half = Array.from<number>({ length: len + 1 }).fill(0);
  let rem = 0;
  for (let i = 0; i <= len; i++) {
    const v = sum[i]! + rem * BASE;
    half[i] = Math.floor(v / 2);
    rem = v % 2;
  }

  // Drop the extra leading digit.
  return half.slice(1);
}

/**
 * Return a key strictly between `a` and `b` under JS `<` comparison.
 *
 * - `keyBetween(null, null)` → `'VV'` (stable initial key)
 * - `keyBetween(a, null)`   → key after `a` (appends four mid digits)
 * - `keyBetween(null, b)`   → key before `b`
 * - `keyBetween(a, b)`      → key strictly between `a` and `b`
 *
 * @throws when both bounds are non-null and `a >= b`.
 */
export function keyBetween(a: string | null, b: string | null): string {
  const mid = DIGITS[MID]!;
  if (a === null && b === null) return mid + mid;

  if (b === null) {
    return a! + mid + mid + mid + mid;
  }

  if (a === null) {
    return _before(b);
  }

  if (a >= b) {
    throw new Error(`keyBetween: a must be < b (a='${a}', b='${b}')`);
  }

  return _between(a, b);
}

/** Return a key strictly before `b`. */
function _before(b: string): string {
  // Walk right-to-left; decrement the first non-zero digit.
  for (let i = b.length - 1; i >= 0; i--) {
    const v = dv(b[i]!);
    if (v > 0) {
      // Decrement digit at i, drop digits to its right.
      // Append a MID digit so there is room to prepend again later.
      const prefix = b.slice(0, i) + DIGITS[v - 1]!;
      return prefix + DIGITS[MID]!;
    }
  }
  // All digits are '0'. Strip the last character — a shorter key is
  // always less than its prefix extension in lex order ("0" < "00" < "000").
  if (b.length > 1) {
    return b.slice(0, -1);
  }
  // b === "0" — no character in [0-9A-Za-z] sorts before '0'.
  throw new Error(
    `keyBetween: cannot generate key before '${b}' — use keyBetween(null, null) for the initial key`,
  );
}

/** Return a key strictly between `a` and `b` (both non-null, `a < b`). */
function _between(a: string, b: string): string {
  const len = Math.max(a.length, b.length);
  const aArr = pad(a, len)
    .split('')
    .map((ch) => dv(ch));
  const bArr = pad(b, len)
    .split('')
    .map((ch) => dv(ch));

  const mid = midDigits(aArr, bArr);
  const midStr = mid.map((d) => DIGITS[d]!).join('');

  // Try canonical (trimmed) form first.
  const trimmed = trim0(midStr);
  if (trimmed > a && trimmed < b) return trimmed;

  // Try full-length midStr.
  if (midStr > a && midStr < b) return midStr;

  // Midpoint is too close to `a` (adjacent). Need to go deeper.
  return _deepBetween(a, b);
}

/**
 * Find a key between `a` and `b` when the arithmetic midpoint is not
 * strictly between them (i.e. the pair is numerically adjacent with
 * integer difference = 1). Walks the shared digit prefix until the
 * single diverging position, then appends a MID digit to produce a
 * sub-key.
 *
 * Invariant on entry: `a < b` AND `_between(a, b)` returned a midpoint
 * equal to `a` (integer difference of 1 at the last digit position).
 * Under this invariant, every shared prefix digit is equal and the only
 * divergence is `b[i] === a[i] + 1` (adjacent) — no other case arises.
 */
function _deepBetween(a: string, b: string): string {
  for (let i = 0; i < b.length; i++) {
    const av = i < a.length ? dv(a[i]!) : 0;
    const bv = dv(b[i]!);

    if (bv === av + 1) {
      // Adjacent digits at position i.
      // Return a[0..i] + MID — strictly > a and < b.
      const prefix = i < a.length ? a.slice(0, i + 1) : a + DIGITS[0]!;
      return prefix + DIGITS[MID]!;
    }

    // Digits are equal — continue walking the shared prefix.
  }

  // Unreachable: a < b guarantees at least one diverging position.
  // Satisfies TypeScript's exhaustive-return check.
  /* c8 ignore next 2 */
  throw new Error(`keyBetween: space exhausted between '${a}' and '${b}'`);
}
