/**
 * AccentService unit tests.
 *
 * Uses jsdom for DOM access (classList, style). Mocks Capacitor Preferences
 * and MutationObserver to test CSS var writing, dark-mode override flipping,
 * and persistence in isolation.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Capacitor Preferences

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

// MutationObserver mock

type MutationCb = MutationCallback;

let capturedMutationCallback: MutationCb | null = null;

class MockMutationObserver {
  constructor(cb: MutationCb) {
    capturedMutationCallback = cb;
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('MutationObserver', MockMutationObserver);

// Helpers

const DARK_CLASS = 'ion-palette-dark';

function triggerClassMutation(): void {
  if (capturedMutationCallback) {
    capturedMutationCallback([], new MockMutationObserver(() => {}) as unknown as MutationObserver);
  }
}

function getCssVar(name: string): string | null {
  return document.documentElement.style.getPropertyValue(name) || null;
}

// Tests

describe('AccentService', () => {
  beforeEach(() => {
    document.documentElement.classList.remove(DARK_CLASS);
    document.documentElement.style.cssText = '';
    mockPreferences.get.mockReset();
    mockPreferences.set.mockReset();
    capturedMutationCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createService() {
    const mod = await import('./accent.service');
    return new mod.AccentService();
  }

  // Defaults

  it('defaults to racing-green when storage is empty', async () => {
    mockPreferences.get.mockResolvedValue({ value: null });
    const svc = await createService();
    await svc.loadFromStorage();

    expect(svc.accent()).toBe('racing-green');
    expect(getCssVar('--hnch-accent')).toBe('#0B3D2E');
    expect(getCssVar('--ion-color-primary')).toBe('#0B3D2E');
  });

  it('defaults to racing-green when stored value is invalid', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'totally-fake' });
    const svc = await createService();
    await svc.loadFromStorage();

    expect(svc.accent()).toBe('racing-green');
  });

  // setAccent — CSS vars + persistence

  it('setAccent writes Preferences and updates --ion-color-primary', async () => {
    mockPreferences.get.mockResolvedValue({ value: null });
    mockPreferences.set.mockResolvedValue();
    const svc = await createService();
    await svc.loadFromStorage();

    await svc.setAccent('blue');

    expect(mockPreferences.set).toHaveBeenCalledWith({
      key: 'hnch.accent',
      value: 'blue',
    });
    expect(getCssVar('--ion-color-primary')).toBe('#0A84FF');
    expect(getCssVar('--hnch-accent')).toBe('#0A84FF');
    expect(svc.accent()).toBe('blue');
  });

  it('setAccent writes all six Ionic primary vars', async () => {
    mockPreferences.get.mockResolvedValue({ value: null });
    mockPreferences.set.mockResolvedValue();
    const svc = await createService();
    await svc.loadFromStorage();

    await svc.setAccent('blue');

    expect(getCssVar('--ion-color-primary-rgb')).toBe('10,132,255');
    expect(getCssVar('--ion-color-primary-contrast')).toBe('#fff');
    expect(getCssVar('--ion-color-primary-contrast-rgb')).toBe('255,255,255');
    // shade + tint are non-empty (exact values not critical here)
    expect(getCssVar('--ion-color-primary-shade')).toBeTruthy();
    expect(getCssVar('--ion-color-primary-tint')).toBeTruthy();
  });

  // Dark-mode override — graphite

  it('flips graphite base to #F2F2F7 when dark class is present', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'graphite' });
    const svc = await createService();

    document.documentElement.classList.add(DARK_CLASS);
    await svc.loadFromStorage();

    expect(getCssVar('--hnch-accent')).toBe('#F2F2F7');
    expect(getCssVar('--ion-color-primary')).toBe('#F2F2F7');
  });

  it('MutationObserver flip: graphite light → dark class added → base flips', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'graphite' });
    const svc = await createService();
    await svc.loadFromStorage();

    // Initially light
    expect(getCssVar('--hnch-accent')).toBe('#1C1C1E');

    // Add dark class then trigger observer
    document.documentElement.classList.add(DARK_CLASS);
    triggerClassMutation();

    expect(getCssVar('--hnch-accent')).toBe('#F2F2F7');
    expect(getCssVar('--ion-color-primary')).toBe('#F2F2F7');
  });

  // Dark-mode override — racing-green

  it('flips racing-green base to #1F6B4F when dark class is present', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'racing-green' });
    const svc = await createService();

    document.documentElement.classList.add(DARK_CLASS);
    await svc.loadFromStorage();

    expect(getCssVar('--hnch-accent')).toBe('#1F6B4F');
    expect(getCssVar('--ion-color-primary')).toBe('#1F6B4F');
  });

  it('MutationObserver flip: racing-green dark → light class removed → base restores', async () => {
    document.documentElement.classList.add(DARK_CLASS);
    mockPreferences.get.mockResolvedValue({ value: 'racing-green' });
    const svc = await createService();
    await svc.loadFromStorage();

    // Dark override active
    expect(getCssVar('--hnch-accent')).toBe('#1F6B4F');

    // Remove dark class then trigger observer
    document.documentElement.classList.remove(DARK_CLASS);
    triggerClassMutation();

    expect(getCssVar('--hnch-accent')).toBe('#0B3D2E');
    expect(getCssVar('--ion-color-primary')).toBe('#0B3D2E');
  });

  // hexToRgbTuple helper

  it('hexToRgbTuple parses #0A84FF → 10,132,255', async () => {
    const { hexToRgbTuple } = await import('./accent.service');
    expect(hexToRgbTuple('#0A84FF')).toBe('10,132,255');
  });

  it('hexToRgbTuple parses lowercase hex', async () => {
    const { hexToRgbTuple } = await import('./accent.service');
    expect(hexToRgbTuple('#0a84ff')).toBe('10,132,255');
  });

  it('hexToRgbTuple parses 3-char shorthand', async () => {
    const { hexToRgbTuple } = await import('./accent.service');
    // #fff → 255,255,255
    expect(hexToRgbTuple('#fff')).toBe('255,255,255');
  });

  // shade / tint helpers

  it('shade darkens by percentage', async () => {
    const { shade } = await import('./accent.service');
    // #ffffff at 0% = #ffffff
    expect(shade('#ffffff', 0)).toBe('#ffffff');
    // Full black at 100%
    expect(shade('#ffffff', 100)).toBe('#000000');
  });

  it('tint lightens toward white', async () => {
    const { tint } = await import('./accent.service');
    expect(tint('#000000', 100)).toBe('#ffffff');
    expect(tint('#000000', 0)).toBe('#000000');
  });

  // Accessible accent text — `--hnch-accent-text`

  it('contrastRatio matches the WCAG reference pairs', async () => {
    const { contrastRatio } = await import('./accent.service');
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Order must not matter.
    expect(contrastRatio('#1F6B4F', '#2C2C2E')).toBeCloseTo(
      contrastRatio('#2C2C2E', '#1F6B4F'),
      10,
    );
  });

  it('dark Racing Green fails AA as a label, which is why the token exists', async () => {
    const { contrastRatio } = await import('./accent.service');
    expect(contrastRatio('#1F6B4F', '#2C2C2E')).toBeLessThan(3);
  });

  it('every accent clears AA as text on every surface, in both modes', async () => {
    const { accessibleAccentText, contrastRatio, ACCENT_TEXT_SURFACES, ACCENT_TEXT_MIN_CONTRAST } =
      await import('./accent.service');
    const { ACCENTS, ACCENTS_DARK_OVERRIDE } = await import('./accent.tokens');

    for (const key of Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]) {
      const light = accessibleAccentText(ACCENTS[key].base, false);
      for (const surface of ACCENT_TEXT_SURFACES.light) {
        expect(contrastRatio(light, surface), `${key} light on ${surface}`).toBeGreaterThanOrEqual(
          ACCENT_TEXT_MIN_CONTRAST,
        );
      }

      const darkBase = (ACCENTS_DARK_OVERRIDE[key] ?? ACCENTS[key]).base;
      const dark = accessibleAccentText(darkBase, true);
      for (const surface of ACCENT_TEXT_SURFACES.dark) {
        expect(contrastRatio(dark, surface), `${key} dark on ${surface}`).toBeGreaterThanOrEqual(
          ACCENT_TEXT_MIN_CONTRAST,
        );
      }
    }
  });

  // The role switch, the "Next" badge, a voter's chip: the label in the
  // accent, on a background tinted with 16% of that same color. The tint
  // moves the background toward the label — blue that held 4.6:1 on the page
  // was 3.7:1 on its own chip.
  it('every accent clears AA on a chip tinted with itself, in both modes', async () => {
    const { accessibleAccentText, blend, contrastRatio, ACCENT_TEXT_SURFACES, ACCENT_TINT_ALPHA } =
      await import('./accent.service');
    const { ACCENTS, ACCENTS_DARK_OVERRIDE } = await import('./accent.tokens');

    for (const key of Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]) {
      for (const isDark of [false, true]) {
        const base = isDark ? (ACCENTS_DARK_OVERRIDE[key] ?? ACCENTS[key]).base : ACCENTS[key].base;
        const text = accessibleAccentText(base, isDark);
        const [page, card] = isDark ? ACCENT_TEXT_SURFACES.dark : ACCENT_TEXT_SURFACES.light;
        for (const surface of [page, card]) {
          const chip = blend(text, surface, ACCENT_TINT_ALPHA);
          expect(
            contrastRatio(text, chip),
            `${key} ${isDark ? 'dark' : 'light'} chip on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('blend composites one color over another', async () => {
    const { blend } = await import('./accent.service');
    expect(blend('#000000', '#ffffff', 0)).toBe('#ffffff');
    expect(blend('#000000', '#ffffff', 1)).toBe('#000000');
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(blend('#0A84FF', '#F2F2F7', 0.16)).toBe('#cde0f8');
  });

  it('keeps the surfaces it checks against in step with the stylesheet', async () => {
    const { ACCENT_TEXT_SURFACES } = await import('./accent.service');
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    // By where this file is, not by where the tests were started from. As
    // text: the URL of the test environment is not the one Node knows.
    const read = (path: string): string =>
      readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
    const css = read('../../theme/variables.scss');
    const upper = (colors: readonly string[]): string[] => colors.map((c) => c.toUpperCase());
    const token = (name: string): string[] =>
      upper(
        [...css.matchAll(new RegExp(`--hnch-${name}:\\s*(#[0-9A-Fa-f]{6})`, 'gu'))].map(
          (m) => m[1]!,
        ),
      );

    // Each token is declared twice: light first, dark second.
    const [lightBg, darkBg] = token('bg');
    const [lightCard, darkCard] = token('elev-1');
    const [lightOverlay, darkOverlay] = token('elev-2');
    expect(upper(ACCENT_TEXT_SURFACES.light)).toEqual([lightBg, lightCard, lightOverlay]);
    expect(upper(ACCENT_TEXT_SURFACES.dark)).toEqual([darkBg, darkCard, darkOverlay]);
  });

  // Tuned to a little more than the minimum: see ACCENT_TEXT_TARGET_CONTRAST.
  it('leaves a margin over the minimum, for every accent in both modes', async () => {
    const { accessibleAccentText, worstAccentTextContrast, ACCENT_TEXT_TARGET_CONTRAST } =
      await import('./accent.service');
    const { ACCENTS, ACCENTS_DARK_OVERRIDE } = await import('./accent.tokens');

    expect(ACCENT_TEXT_TARGET_CONTRAST).toBeGreaterThan(4.5);
    for (const key of Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]) {
      for (const isDark of [false, true]) {
        const base = isDark ? (ACCENTS_DARK_OVERRIDE[key] ?? ACCENTS[key]).base : ACCENTS[key].base;
        const text = accessibleAccentText(base, isDark);
        expect(
          worstAccentTextContrast(text, isDark),
          `${key} ${isDark ? 'dark' : 'light'}`,
        ).toBeGreaterThanOrEqual(ACCENT_TEXT_TARGET_CONTRAST);
      }
    }
  });

  it('leaves a base that already passes untouched', async () => {
    const { accessibleAccentText } = await import('./accent.service');
    // Racing Green on a light surface is ~11:1.
    expect(accessibleAccentText('#0B3D2E', false)).toBe('#0b3d2e');
  });

  it('writes --hnch-accent-text lighter than the base in dark mode', async () => {
    const { relativeLuminance } = await import('./accent.service');
    mockPreferences.get.mockResolvedValue({ value: 'racing-green' });
    const svc = await createService();

    document.documentElement.classList.add(DARK_CLASS);
    await svc.loadFromStorage();

    const text = getCssVar('--hnch-accent-text');
    expect(text).toBeTruthy();
    expect(relativeLuminance(text!)).toBeGreaterThan(relativeLuminance('#1F6B4F'));
    expect(getCssVar('--hnch-accent-text-rgb')).toMatch(/^\d+,\d+,\d+$/u);
    // The fill is untouched — only the label variant moves.
    expect(getCssVar('--hnch-accent')).toBe('#1F6B4F');
  });

  it('recomputes --hnch-accent-text when the theme flips', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'amber' });
    const svc = await createService();
    await svc.loadFromStorage();
    const lightText = getCssVar('--hnch-accent-text');

    document.documentElement.classList.add(DARK_CLASS);
    triggerClassMutation();

    expect(getCssVar('--hnch-accent-text')).not.toBe(lightText);
  });

  // Persistence round-trip

  it('reads persisted value from Preferences on loadFromStorage', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'teal' });
    const svc = await createService();
    await svc.loadFromStorage();

    expect(mockPreferences.get).toHaveBeenCalledWith({ key: 'hnch.accent' });
    expect(svc.accent()).toBe('teal');
    expect(getCssVar('--hnch-accent')).toBe('#40C8E0');
  });
});
