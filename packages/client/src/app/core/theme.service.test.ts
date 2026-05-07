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

let currentMediaMatches = false;
let mediaChangeHandler: MediaChangeHandler | null = null;

function createMockMediaQueryList(matches: boolean): MediaQueryList {
  currentMediaMatches = matches;
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

  beforeEach(() => {
    // Reset DOM state
    document.documentElement.classList.remove(DARK_CLASS);
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
    mockPreferences.set.mockResolvedValue(undefined);
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
    mockPreferences.set.mockResolvedValue(undefined);
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
