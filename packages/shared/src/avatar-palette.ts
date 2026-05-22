/**
 * Avatar / accent color palette (ADR-0043).
 *
 * Single source of truth for the curated 12-color palette used by both the
 * per-user theme accent (client) and the per-participant avatar color
 * (mobile + CLI). Theme accent and avatar color remain independent
 * settings — they happen to share keys + definitions.
 *
 * Lives in `@hnch/shared` so the CLI can map the same keys to ANSI bg
 * colors and so the validator + deterministic-first-launch helper can
 * be reused across packages.
 */

export type AccentKey =
  | 'racing-green'
  | 'dijon'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'pink'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'graphite';

export interface AccentDef {
  /** Solid base color (hex). Used for filled avatar dots and accent chips. */
  base: string;
  /** Low-alpha tint of `base`. Used for soft backgrounds + hover states. */
  soft: string;
  /** Foreground text/icon color over `base` (`'#fff' | '#000'`). */
  ink: string;
  /** Human-readable label for UI + screen-reader `aria-label`. */
  label: string;
}

export const ACCENTS: Record<AccentKey, AccentDef> = {
  'racing-green': {
    base: '#0B3D2E',
    soft: 'rgba(11,61,46,0.14)',
    ink: '#fff',
    label: 'Racing Green',
  },
  dijon: { base: '#C9A227', soft: 'rgba(201,162,39,0.18)', ink: '#000', label: 'Dijon' },
  blue: { base: '#0A84FF', soft: 'rgba(10,132,255,0.14)', ink: '#fff', label: 'Blue' },
  indigo: { base: '#5E5CE6', soft: 'rgba(94,92,230,0.14)', ink: '#fff', label: 'Indigo' },
  violet: { base: '#BF5AF2', soft: 'rgba(191,90,242,0.14)', ink: '#fff', label: 'Violet' },
  pink: { base: '#FF375F', soft: 'rgba(255,55,95,0.14)', ink: '#fff', label: 'Pink' },
  red: { base: '#FF453A', soft: 'rgba(255,69,58,0.14)', ink: '#fff', label: 'Red' },
  orange: { base: '#FF9F0A', soft: 'rgba(255,159,10,0.16)', ink: '#000', label: 'Orange' },
  amber: { base: '#FFD60A', soft: 'rgba(255,214,10,0.18)', ink: '#000', label: 'Amber' },
  green: { base: '#30D158', soft: 'rgba(48,209,88,0.14)', ink: '#000', label: 'Green' },
  teal: { base: '#40C8E0', soft: 'rgba(64,200,224,0.14)', ink: '#000', label: 'Teal' },
  graphite: { base: '#1C1C1E', soft: 'rgba(28,28,30,0.10)', ink: '#fff', label: 'Graphite' },
};

export const ACCENTS_DARK_OVERRIDE: Partial<Record<AccentKey, AccentDef>> = {
  graphite: { base: '#F2F2F7', soft: 'rgba(242,242,247,0.16)', ink: '#000', label: 'Graphite' },
  'racing-green': {
    base: '#1F6B4F',
    soft: 'rgba(31,107,79,0.20)',
    ink: '#fff',
    label: 'Racing Green',
  },
};

export const DEFAULT_ACCENT: AccentKey = 'racing-green';

/**
 * Ordered list of palette keys. Stable indexing for
 * `deterministicAvatarColor`. Order matches the `ACCENTS` record's
 * insertion order above; do not reorder without bumping ADR-0043
 * (would silently change every user's deterministic first-launch
 * color on next install).
 */
export const AVATAR_PALETTE_KEYS: readonly AccentKey[] = [
  'racing-green',
  'dijon',
  'blue',
  'indigo',
  'violet',
  'pink',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'graphite',
];

/**
 * Wire format for a participant's avatar color (ADR-0043).
 * - An `AccentKey` (one of the 12 palette keys), or
 * - A `#rrggbb` hex literal (custom user choice).
 *
 * Stored on the participant record as a plain string; readers must
 * funnel through `parseAvatarColor` to tolerate missing / unknown
 * values from old or future clients.
 */
export type AvatarColorValue = string;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isAccentKey(v: string): v is AccentKey {
  return Object.hasOwn(ACCENTS, v);
}

/**
 * Resolve an `avatarColor` wire value to a concrete hex color string.
 * Returns `null` for missing / malformed values so callers can fall
 * back to `deterministicAvatarColor(deviceId)`.
 *
 * Accepted inputs:
 * - `undefined` / empty string → `null`
 * - `AccentKey` → `ACCENTS[key].base`
 * - `#rrggbb` → normalized to lowercase
 * - anything else → `null`
 */
export function parseAvatarColor(value: string | undefined | null): string | null {
  if (!value) return null;
  if (isAccentKey(value)) return ACCENTS[value].base;
  if (HEX_RE.test(value)) return value.toLowerCase();
  return null;
}

/**
 * Stable hash → palette key, derived from `deviceId`. Used at first
 * launch (and as the fallback when a peer's `avatarColor` is missing
 * / invalid) so a participant's color is deterministic across
 * reinstalls and visible to peers running pre-feature clients
 * (ADR-0043).
 *
 * Algorithm is djb2 over UTF-16 code units, modulo palette length.
 * Pure, dependency-free, identical across mobile + CLI.
 */
export function deterministicAvatarColor(deviceId: string): AccentKey {
  let hash = 5381;
  for (let i = 0; i < deviceId.length; i++) {
    hash = ((hash << 5) + hash + deviceId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE_KEYS.length;
  return AVATAR_PALETTE_KEYS[idx]!;
}

/**
 * Convenience: never-null resolution. Falls back to the deterministic
 * key when the wire value is missing or invalid.
 */
export function resolveAvatarColor(value: string | undefined | null, deviceId: string): string {
  return parseAvatarColor(value) ?? ACCENTS[deterministicAvatarColor(deviceId)].base;
}

/**
 * Resolve the ink (foreground) color paired with the avatar background
 * for `value`. Mirrors `resolveAvatarColor`'s fallback shape so callers
 * can bind text/icon color over the rendered avatar bg without picking
 * a contrast color themselves (ADR-0043).
 *
 * - `AccentKey` → declared `ACCENTS[key].ink`.
 * - `#rrggbb` (custom hex) → WCAG relative luminance of the hex itself;
 *   `'#000'` when `L > 0.179`, else `'#fff'`. Computed from the actual
 *   rendered bg, not a palette fallback, since custom-color UI can emit
 *   arbitrary hexes whose contrast can't be predicted by key.
 * - missing / invalid → ink of the deterministic palette key for `deviceId`.
 */
export function resolveAvatarInkColor(
  value: string | undefined | null,
  deviceId: string,
): '#000' | '#fff' {
  if (value) {
    if (isAccentKey(value)) return ACCENTS[value].ink as '#000' | '#fff';
    if (HEX_RE.test(value)) return inkForHex(value);
  }
  return ACCENTS[deterministicAvatarColor(deviceId)].ink as '#000' | '#fff';
}

function inkForHex(hex: string): '#000' | '#fff' {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? '#000' : '#fff';
}
