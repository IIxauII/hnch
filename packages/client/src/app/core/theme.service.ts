import { Injectable, signal, type Signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/** User-selectable theme preference. */
export type Theme = 'system' | 'light' | 'dark';

const PREF_KEY = 'hnch.theme';
const DARK_CLASS = 'ion-palette-dark';

/**
 * `--hnch-bg` per mode (variables.scss), for the browser's own chrome — the
 * address bar on a phone, the title bar of the installed app.
 */
const CHROME_COLOR = { light: '#F2F2F7', dark: '#1C1C1E' } as const;

/**
 * Manages the app's colour scheme preference (system / light / dark).
 *
 * Persists the choice via Capacitor Preferences and controls dark mode
 * by toggling `.ion-palette-dark` on `<html>`. An `APP_INITIALIZER` in
 * `main.ts` calls {@link ensureLoaded} so the class is applied before
 * first paint — no flash-of-wrong-theme once Angular renders.
 *
 * What the browser draws itself follows the choice too, not the OS: the
 * `theme-color` of the chrome around the page here, and the scrollbars and
 * native controls through `color-scheme` in variables.scss.
 *
 * See ionic.md (dark-mode / theming section) and ux.md §7.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly themeSignal = signal<Theme>('system');
  private loading: Promise<void> | null = null;
  private mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
  private mediaQuery: MediaQueryList | null = null;

  /** Current theme preference — synchronous after bootstrap. */
  readonly theme: Signal<Theme> = this.themeSignal.asReadonly();

  /**
   * Read the persisted preference and apply the corresponding class.
   * Safe to call multiple times — a single in-flight promise is shared.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.load();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /** Persist a new preference and apply it immediately. */
  async setTheme(value: Theme): Promise<void> {
    await Preferences.set({ key: PREF_KEY, value });
    this.themeSignal.set(value);
    this.applyTheme(value);
  }

  private async load(): Promise<void> {
    const { value } = await Preferences.get({ key: PREF_KEY });
    const theme = isTheme(value) ? value : 'system';
    this.themeSignal.set(theme);
    this.applyTheme(theme);
  }

  private applyTheme(value: Theme): void {
    // Always detach any previous system listener first.
    this.detachMediaListener();

    const el = document.documentElement;

    if (value === 'dark') {
      el.classList.add(DARK_CLASS);
      this.paintChrome('dark');
      return;
    }

    if (value === 'light') {
      el.classList.remove(DARK_CLASS);
      this.paintChrome('light');
      return;
    }

    // 'system' — mirror the OS preference and listen for changes.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery = mq;
    el.classList.toggle(DARK_CLASS, mq.matches);
    this.paintChrome('system');

    this.mediaListener = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle(DARK_CLASS, e.matches);
    };
    mq.addEventListener('change', this.mediaListener);
  }

  /**
   * index.html carries one `theme-color` per OS scheme. With the theme left
   * to the system that is right as it stands; with a theme chosen here, both
   * say the chosen one — whichever of them the OS picks, the chrome matches
   * the page.
   */
  private paintChrome(value: Theme): void {
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      const scheme = value === 'system' ? (meta.media.includes('dark') ? 'dark' : 'light') : value;
      meta.content = CHROME_COLOR[scheme];
    }
  }

  private detachMediaListener(): void {
    if (this.mediaQuery && this.mediaListener) {
      this.mediaQuery.removeEventListener('change', this.mediaListener);
    }
    this.mediaQuery = null;
    this.mediaListener = null;
  }
}

function isTheme(value: string | null): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}
