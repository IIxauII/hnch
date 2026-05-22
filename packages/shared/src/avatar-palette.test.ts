import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  ACCENTS_DARK_OVERRIDE,
  AVATAR_PALETTE_KEYS,
  DEFAULT_ACCENT,
  deterministicAvatarColor,
  parseAvatarColor,
  resolveAvatarColor,
  resolveAvatarInkColor,
} from './avatar-palette.js';

describe('AVATAR_PALETTE_KEYS', () => {
  it('contains all 12 ACCENTS keys with no duplicates', () => {
    expect(AVATAR_PALETTE_KEYS.length).toBe(12);
    expect(new Set(AVATAR_PALETTE_KEYS).size).toBe(12);
    for (const k of AVATAR_PALETTE_KEYS) {
      expect(ACCENTS[k]).toBeDefined();
    }
  });

  it('order is stable — first key is racing-green, last is graphite', () => {
    // Reordering would silently change every user's deterministic first-launch
    // color. Guard against accidental reordering.
    expect(AVATAR_PALETTE_KEYS[0]).toBe('racing-green');
    expect(AVATAR_PALETTE_KEYS[AVATAR_PALETTE_KEYS.length - 1]).toBe('graphite');
  });

  it('DEFAULT_ACCENT is in the palette', () => {
    expect(AVATAR_PALETTE_KEYS).toContain(DEFAULT_ACCENT);
  });

  it('every accent has light variant; dark overrides are subset', () => {
    for (const k of AVATAR_PALETTE_KEYS) {
      expect(ACCENTS[k].base).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(ACCENTS[k].label.length).toBeGreaterThan(0);
      expect(['#fff', '#000']).toContain(ACCENTS[k].ink);
    }
    for (const k of Object.keys(ACCENTS_DARK_OVERRIDE)) {
      expect(AVATAR_PALETTE_KEYS).toContain(k as never);
    }
  });
});

describe('parseAvatarColor', () => {
  it('returns null for undefined / null / empty', () => {
    expect(parseAvatarColor(undefined)).toBeNull();
    expect(parseAvatarColor(null)).toBeNull();
    expect(parseAvatarColor('')).toBeNull();
  });

  it('resolves AccentKey → ACCENTS[key].base', () => {
    expect(parseAvatarColor('blue')).toBe(ACCENTS.blue.base);
    expect(parseAvatarColor('racing-green')).toBe(ACCENTS['racing-green'].base);
    expect(parseAvatarColor('graphite')).toBe(ACCENTS.graphite.base);
  });

  it('accepts #rrggbb hex (lowercases)', () => {
    expect(parseAvatarColor('#abcdef')).toBe('#abcdef');
    expect(parseAvatarColor('#ABCDEF')).toBe('#abcdef');
    expect(parseAvatarColor('#000000')).toBe('#000000');
    expect(parseAvatarColor('#FFFFFF')).toBe('#ffffff');
  });

  it('rejects malformed hex / unknown keys', () => {
    expect(parseAvatarColor('abcdef')).toBeNull(); // missing #
    expect(parseAvatarColor('#abc')).toBeNull(); // 3-char shorthand not supported
    expect(parseAvatarColor('#abcdefg')).toBeNull(); // 7 chars / non-hex
    expect(parseAvatarColor('#zzzzzz')).toBeNull();
    expect(parseAvatarColor('not-a-key')).toBeNull();
    expect(parseAvatarColor('rgb(0,0,0)')).toBeNull();
  });

  it('is safe against prototype-pollution keys', () => {
    expect(parseAvatarColor('__proto__')).toBeNull();
    expect(parseAvatarColor('constructor')).toBeNull();
    expect(parseAvatarColor('toString')).toBeNull();
  });
});

describe('deterministicAvatarColor', () => {
  it('is deterministic for the same input', () => {
    const a = deterministicAvatarColor('device-abc');
    const b = deterministicAvatarColor('device-abc');
    expect(a).toBe(b);
  });

  it('returns a key that exists in the palette', () => {
    for (const id of ['device-1', 'device-2', 'device-3', '', 'a', 'long-device-id-xyz']) {
      const key = deterministicAvatarColor(id);
      expect(AVATAR_PALETTE_KEYS).toContain(key);
    }
  });

  it('spreads roughly across the palette over many inputs', () => {
    // 1000 random-ish ids should hit at least 10 of 12 buckets.
    const buckets = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      buckets.add(deterministicAvatarColor(`d-${i}-${i * 7}`));
    }
    expect(buckets.size).toBeGreaterThanOrEqual(10);
  });
});

describe('resolveAvatarColor', () => {
  it('uses parsed value when valid', () => {
    expect(resolveAvatarColor('blue', 'dev')).toBe(ACCENTS.blue.base);
    expect(resolveAvatarColor('#123456', 'dev')).toBe('#123456');
  });

  it('falls back to deterministic palette key when missing / invalid', () => {
    const fallback = ACCENTS[deterministicAvatarColor('dev-x')].base;
    expect(resolveAvatarColor(undefined, 'dev-x')).toBe(fallback);
    expect(resolveAvatarColor('garbage', 'dev-x')).toBe(fallback);
  });
});

describe('resolveAvatarInkColor', () => {
  it('returns declared ink for every AccentKey', () => {
    for (const k of AVATAR_PALETTE_KEYS) {
      expect(resolveAvatarInkColor(k, 'dev')).toBe(ACCENTS[k].ink);
    }
  });

  it('computes #000 for light custom hexes', () => {
    expect(resolveAvatarInkColor('#FFFF00', 'dev')).toBe('#000');
    expect(resolveAvatarInkColor('#FFD60A', 'dev')).toBe('#000');
    expect(resolveAvatarInkColor('#ffffff', 'dev')).toBe('#000');
  });

  it('computes #fff for dark custom hexes', () => {
    expect(resolveAvatarInkColor('#111111', 'dev')).toBe('#fff');
    expect(resolveAvatarInkColor('#0B3D2E', 'dev')).toBe('#fff');
    expect(resolveAvatarInkColor('#000000', 'dev')).toBe('#fff');
  });

  it('falls back to deterministic-key ink when missing / invalid', () => {
    const fallback = ACCENTS[deterministicAvatarColor('dev-x')].ink;
    expect(resolveAvatarInkColor(undefined, 'dev-x')).toBe(fallback);
    expect(resolveAvatarInkColor(null, 'dev-x')).toBe(fallback);
    expect(resolveAvatarInkColor('', 'dev-x')).toBe(fallback);
    expect(resolveAvatarInkColor('garbage', 'dev-x')).toBe(fallback);
  });
});
