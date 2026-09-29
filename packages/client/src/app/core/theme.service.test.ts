/**
 * ThemeService unit tests.
 *
 * Uses jsdom for DOM access (classList, matchMedia). Mocks Capacitor
 * Preferences and window.matchMedia to test class toggling, listener
 * lifecycle, and persistence in isolation.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Capacitor Preferences
// ---------------------------------------------------------------------------

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

// ---------------------------------------------------------------------------
// matchMedia mock helpers
// ---------------------------------------------------------------------------

type MediaChangeHandler = (e: MediaQueryListEvent) => void;

let mediaChangeHandler: MediaChangeHandler | null = null;

function createMockMediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_event: string, handler: MediaChangeHandler) => {
      mediaChangeHandler = handler;
    }),
    removeEventListener: vi.fn((_event: string, _handler: MediaChangeHandler) => {
      mediaChangeHandler = null;
    }),
    // Unused but required by the interface
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;
}

function simulateMediaChange(matches: boolean): void {
  if (mediaChangeHandler) {
    mediaChangeHandler({ matches } as MediaQueryListEvent);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThemeService', () => {
  const DARK_CLASS = 'ion-palette-dark';

  /** The two `theme-color` tags index.html ships, one per OS scheme. */
  function mountChromeTags(): void {
    for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove();
    for (const [scheme, color] of [
      ['light', '#F2F2F7'],
      ['dark', '#1C1C1E'],
    ] as const) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.media = `(prefers-color-scheme: ${scheme})`;
      meta.content = color;
      document.head.append(meta);
    }
  }

  function chromeColors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const meta of document.head.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )) {
      out[meta.media.includes('dark') ? 'dark' : 'light'] = meta.content;
    }
    return out;
  }

  beforeEach(() => {
    // Reset DOM state
    document.documentElement.classList.remove(DARK_CLASS);
    mountChromeTags();
    // Reset mocks
    mockPreferences.get.mockReset();
    mockPreferences.set.mockReset();
    mediaChangeHandler = null;
    // Default: matchMedia returns light
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMockMediaQueryList(false));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Fresh import each test to avoid stale signal state
  async function createService() {
    // Dynamic import with cache-bust to get a fresh instance
    const mod = await import('./theme.service');
    // Construct a fresh instance via the class (bypasses Angular DI)
    return new mod.ThemeService();
  }

  // -------------------------------------------------------------------------
  // applyTheme logic (exercised via ensureLoaded / setTheme)
  // -------------------------------------------------------------------------

  it('adds .ion-palette-dark when theme is dark', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'dark' });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
    expect(svc.theme()).toBe('dark');
  });

  it('removes .ion-palette-dark when theme is light', async () => {
    document.documentElement.classList.add(DARK_CLASS);
    mockPreferences.get.mockResolvedValue({ value: 'light' });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
    expect(svc.theme()).toBe('light');
  });

  // The OS says light, the user said dark: the address bar must not stay
  // light around a dark page.
  it('paints the browser chrome in the chosen theme, whatever the OS says', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'dark' });
    const svc = await createService();
    await svc.ensureLoaded();
    expect(chromeColors()).toEqual({ light: '#1C1C1E', dark: '#1C1C1E' });

    mockPreferences.set.mockResolvedValue();
    await svc.setTheme('light');
    expect(chromeColors()).toEqual({ light: '#F2F2F7', dark: '#F2F2F7' });
  });

  it('hands the browser chrome back to the OS with the theme', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'dark' });
    mockPreferences.set.mockResolvedValue();
    const svc = await createService();
    await svc.ensureLoaded();

    await svc.setTheme('system');

    expect(chromeColors()).toEqual({ light: '#F2F2F7', dark: '#1C1C1E' });
  });

  it('does without the tags where there are none', async () => {
    for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove();
    mockPreferences.get.mockResolvedValue({ value: 'dark' });
    const svc = await createService();

    await expect(svc.ensureLoaded()).resolves.toBeUndefined();
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it('uses the page background of each mode, as the stylesheet and index.html have it', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // Vitest runs from the package root.
    const css = readFileSync(resolve(process.cwd(), 'src/theme/variables.scss'), 'utf8');
    const html = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');
    const [lightBg, darkBg] = [...css.matchAll(/--hnch-bg:\s*(#[0-9A-Fa-f]{6})/gu)].map(
      (m) => m[1],
    );
    const tags = [...html.matchAll(/name="theme-color" media="([^"]+)" content="([^"]+)"/gu)];

    mockPreferences.get.mockResolvedValue({ value: 'system' });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(chromeColors()).toEqual({ light: lightBg, dark: darkBg });
    expect(tags.map((t) => [t[1]!.includes('dark') ? 'dark' : 'light', t[2]])).toEqual([
      ['light', lightBg],
      ['dark', darkBg],
    ]);
  });

  it('mirrors system preference when theme is system (dark OS)', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMockMediaQueryList(true));
    mockPreferences.get.mockResolvedValue({ value: 'system' });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
    expect(svc.theme()).toBe('system');
  });

  it('mirrors system preference when theme is system (light OS)', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMockMediaQueryList(false));
    mockPreferences.get.mockResolvedValue({ value: 'system' });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it('responds to live OS preference changes in system mode', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMockMediaQueryList(false));
    mockPreferences.get.mockResolvedValue({ value: 'system' });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);

    // Simulate OS switching to dark
    simulateMediaChange(true);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);

    // Simulate OS switching back to light
    simulateMediaChange(false);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it('detaches media query listener when switching away from system', async () => {
    const mql = createMockMediaQueryList(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql);
    mockPreferences.get.mockResolvedValue({ value: 'system' });
    mockPreferences.set.mockResolvedValue();
    const svc = await createService();
    await svc.ensureLoaded();

    // Listener attached
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    // Switch to dark — should detach
    await svc.setTheme('dark');
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  it('persists theme to Preferences on setTheme', async () => {
    mockPreferences.get.mockResolvedValue({ value: null });
    mockPreferences.set.mockResolvedValue();
    const svc = await createService();
    await svc.ensureLoaded();

    await svc.setTheme('dark');

    expect(mockPreferences.set).toHaveBeenCalledWith({
      key: 'hnch.theme',
      value: 'dark',
    });
  });

  it('reads persisted value on ensureLoaded', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'light' });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(mockPreferences.get).toHaveBeenCalledWith({ key: 'hnch.theme' });
    expect(svc.theme()).toBe('light');
  });

  it('defaults to system when no persisted value', async () => {
    mockPreferences.get.mockResolvedValue({ value: null });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(svc.theme()).toBe('system');
  });

  it('defaults to system when persisted value is invalid', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'invalid-value' });
    const svc = await createService();
    await svc.ensureLoaded();

    expect(svc.theme()).toBe('system');
  });
});
