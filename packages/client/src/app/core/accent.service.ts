import { Injectable, signal, type Signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import {
  ACCENTS,
  ACCENTS_DARK_OVERRIDE,
  DEFAULT_ACCENT,
  type AccentDef,
  type AccentKey,
} from './accent.tokens';

const PREF_KEY = 'hnch.accent';
const DARK_CLASS = 'ion-palette-dark';

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** Parse a 3- or 6-digit hex color to an `r,g,b` tuple string. */
export function hexToRgbTuple(hex: string): string {
  const clean = hex.replace('#', '');
  let r: number, g: number, b: number;

  if (clean.length === 3) {
    const c0 = clean.charAt(0);
    const c1 = clean.charAt(1);
    const c2 = clean.charAt(2);
    r = parseInt(c0 + c0, 16);
    g = parseInt(c1 + c1, 16);
    b = parseInt(c2 + c2, 16);
  } else {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }

  return `${r},${g},${b}`;
}

/**
 * Darken a hex color by `pct` percent (0–100).
 *
 * Equivalent to Ionic color-generator math: `mix(#000, base, pct%)` — per channel,
 * `0 * (pct/100) + channel * (1 - pct/100) = channel * (1 - pct/100)`. Byte-identical
 * to Ionic's stock output, so accent shades match what the generator would produce.
 */
export function shade(hex: string, pct: number): string {
  const clean = hex.replace('#', '');
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const r = clamp(Math.round(parseInt(clean.slice(0, 2), 16) * (1 - pct / 100)));
  const g = clamp(Math.round(parseInt(clean.slice(2, 4), 16) * (1 - pct / 100)));
  const b = clamp(Math.round(parseInt(clean.slice(4, 6), 16) * (1 - pct / 100)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Lighten a hex color by `pct` percent (0–100) toward white.
 *
 * Equivalent to Ionic color-generator math: `mix(#fff, base, pct%)` — per channel,
 * `255 * (pct/100) + channel * (1 - pct/100) = channel + (255 - channel) * (pct/100)`.
 * Byte-identical to Ionic's stock output.
 */
export function tint(hex: string, pct: number): string {
  const clean = hex.replace('#', '');
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const r = clamp(
    Math.round(
      parseInt(clean.slice(0, 2), 16) + (255 - parseInt(clean.slice(0, 2), 16)) * (pct / 100),
    ),
  );
  const g = clamp(
    Math.round(
      parseInt(clean.slice(2, 4), 16) + (255 - parseInt(clean.slice(2, 4), 16)) * (pct / 100),
    ),
  );
  const b = clamp(
    Math.round(
      parseInt(clean.slice(4, 6), 16) + (255 - parseInt(clean.slice(4, 6), 16)) * (pct / 100),
    ),
  );
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** WCAG 2.x relative luminance of a 6-digit hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channel = (offset: number): number => {
    const c = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG 2.x contrast ratio between two 6-digit hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Worst-case surface an accent-colored label can sit on, per mode: the
 * lightest dark surface (`--hnch-elev-3`) and the darkest light one
 * (`--hnch-bg`). Clearing the target against these clears it against every
 * other surface token in `variables.scss` — keep the two in sync.
 */
export const ACCENT_TEXT_SURFACE = { dark: '#48484A', light: '#F2F2F7' } as const;

/** WCAG AA minimum for body-size text. */
export const ACCENT_TEXT_MIN_CONTRAST = 4.5;

/**
 * The accent as it may be used for *text and icons on a surface*.
 *
 * `base` is tuned to be a fill — Racing Green on a dark surface is 2.2:1, and
 * Amber on a light one is 1.4:1, so neither can carry a label. This walks the
 * base toward white (dark mode) or black (light mode) until it clears AA,
 * keeping the hue. A base that already passes comes back unchanged.
 */
export function accessibleAccentText(base: string, isDark: boolean): string {
  const surface = isDark ? ACCENT_TEXT_SURFACE.dark : ACCENT_TEXT_SURFACE.light;
  for (let pct = 0; pct <= 100; pct += 2) {
    const candidate = isDark ? tint(base, pct) : shade(base, pct);
    if (contrastRatio(candidate, surface) >= ACCENT_TEXT_MIN_CONTRAST) return candidate;
  }
  return isDark ? '#ffffff' : '#000000';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Manages the app's accent colour preference.
 *
 * Persists the choice via Capacitor Preferences (`hnch.accent`) and writes
 * CSS custom properties onto `<html>` — both `--hnch-accent-*` design tokens
 * and `--ion-color-primary-*` so that Ionic components automatically re-color.
 *
 * Dark-mode overrides (graphite, racing-green) are re-applied whenever the
 * `.ion-palette-dark` class changes on `<html>`.
 *
 * An `APP_INITIALIZER` in `main.ts` calls {@link loadFromStorage} so vars are
 * set before first paint — no flash of wrong accent.
 *
 * See plan-hnch-design-overhaul-1-foundations.md §accent.service.ts.
 */
@Injectable({ providedIn: 'root' })
export class AccentService {
  private readonly accentSignal = signal<AccentKey>(DEFAULT_ACCENT);
  private loading: Promise<void> | null = null;
  private darkObserver: MutationObserver | null = null;
  private lastIsDark: boolean | null = null;

  /** Current accent key — synchronous after bootstrap. */
  readonly accent: Signal<AccentKey> = this.accentSignal.asReadonly();

  /**
   * Read the persisted accent from Capacitor Preferences and apply CSS vars.
   * Safe to call multiple times — a single in-flight promise is shared.
   */
  async loadFromStorage(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.load();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /** Persist a new accent choice and apply it immediately. */
  async setAccent(key: AccentKey): Promise<void> {
    await Preferences.set({ key: PREF_KEY, value: key });
    this.accentSignal.set(key);
    this.applyAccent(key);
  }

  private async load(): Promise<void> {
    const { value } = await Preferences.get({ key: PREF_KEY });
    const key = isAccentKey(value) ? value : DEFAULT_ACCENT;
    this.accentSignal.set(key);
    this.applyAccent(key);
    this.attachDarkObserver();
  }

  private applyAccent(key: AccentKey): void {
    const isDark = document.documentElement.classList.contains(DARK_CLASS);
    const override = isDark ? ACCENTS_DARK_OVERRIDE[key] : undefined;
    const def: AccentDef = override ?? ACCENTS[key];
    this.writeCssVars(def, isDark);
  }

  private writeCssVars(def: AccentDef, isDark: boolean): void {
    const el = document.documentElement;
    const rgb = hexToRgbTuple(def.base);
    const inkRgb = hexToRgbTuple(def.ink);
    const shadedBase = shade(def.base, 12);
    const tintedBase = tint(def.base, 12);
    const text = accessibleAccentText(def.base, isDark);

    el.style.setProperty('--hnch-accent', def.base);
    el.style.setProperty('--hnch-accent-rgb', rgb);
    el.style.setProperty('--hnch-accent-soft', def.soft);
    el.style.setProperty('--hnch-accent-ink', def.ink);
    // Fills use `--hnch-accent`; labels and icons on a surface use these.
    el.style.setProperty('--hnch-accent-text', text);
    el.style.setProperty('--hnch-accent-text-rgb', hexToRgbTuple(text));

    el.style.setProperty('--ion-color-primary', def.base);
    el.style.setProperty('--ion-color-primary-rgb', rgb);
    el.style.setProperty('--ion-color-primary-contrast', def.ink);
    el.style.setProperty('--ion-color-primary-contrast-rgb', inkRgb);
    el.style.setProperty('--ion-color-primary-shade', shadedBase);
    el.style.setProperty('--ion-color-primary-tint', tintedBase);
  }

  private attachDarkObserver(): void {
    this.darkObserver?.disconnect();
    this.lastIsDark = document.documentElement.classList.contains(DARK_CLASS);
    this.darkObserver = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains(DARK_CLASS);
      if (isDark === this.lastIsDark) return;
      this.lastIsDark = isDark;
      this.applyAccent(this.accentSignal());
    });
    this.darkObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
}

function isAccentKey(value: string | null): value is AccentKey {
  if (!value) return false;
  return value in ACCENTS;
}
