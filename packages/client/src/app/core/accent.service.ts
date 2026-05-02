import { Injectable, signal, type Signal } from '@angular/core'
import { Preferences } from '@capacitor/preferences'

import {
  ACCENTS,
  ACCENTS_DARK_OVERRIDE,
  DEFAULT_ACCENT,
  type AccentDef,
  type AccentKey,
} from './accent.tokens'

const PREF_KEY = 'hnch.accent'
const DARK_CLASS = 'ion-palette-dark'

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** Parse a 3- or 6-digit hex color to an `r,g,b` tuple string. */
export function hexToRgbTuple(hex: string): string {
  const clean = hex.replace('#', '')
  let r: number, g: number, b: number

  if (clean.length === 3) {
    const c0 = clean.charAt(0)
    const c1 = clean.charAt(1)
    const c2 = clean.charAt(2)
    r = parseInt(c0 + c0, 16)
    g = parseInt(c1 + c1, 16)
    b = parseInt(c2 + c2, 16)
  } else {
    r = parseInt(clean.slice(0, 2), 16)
    g = parseInt(clean.slice(2, 4), 16)
    b = parseInt(clean.slice(4, 6), 16)
  }

  return `${r},${g},${b}`
}

/** Darken a hex color by `pct` percent (0–100). */
export function shade(hex: string, pct: number): string {
  const clean = hex.replace('#', '')
  const clamp = (n: number) => Math.max(0, Math.min(255, n))
  const r = clamp(Math.round(parseInt(clean.slice(0, 2), 16) * (1 - pct / 100)))
  const g = clamp(Math.round(parseInt(clean.slice(2, 4), 16) * (1 - pct / 100)))
  const b = clamp(Math.round(parseInt(clean.slice(4, 6), 16) * (1 - pct / 100)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Lighten a hex color by `pct` percent (0–100) toward white. */
export function tint(hex: string, pct: number): string {
  const clean = hex.replace('#', '')
  const clamp = (n: number) => Math.max(0, Math.min(255, n))
  const r = clamp(Math.round(parseInt(clean.slice(0, 2), 16) + (255 - parseInt(clean.slice(0, 2), 16)) * (pct / 100)))
  const g = clamp(Math.round(parseInt(clean.slice(2, 4), 16) + (255 - parseInt(clean.slice(2, 4), 16)) * (pct / 100)))
  const b = clamp(Math.round(parseInt(clean.slice(4, 6), 16) + (255 - parseInt(clean.slice(4, 6), 16)) * (pct / 100)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
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
  private readonly accentSignal = signal<AccentKey>(DEFAULT_ACCENT)
  private loading: Promise<void> | null = null
  private darkObserver: MutationObserver | null = null
  private lastIsDark: boolean | null = null

  /** Current accent key — synchronous after bootstrap. */
  readonly accent: Signal<AccentKey> = this.accentSignal.asReadonly()

  /**
   * Read the persisted accent from Capacitor Preferences and apply CSS vars.
   * Safe to call multiple times — a single in-flight promise is shared.
   */
  async loadFromStorage(): Promise<void> {
    if (this.loading) return this.loading
    this.loading = this.load()
    try {
      await this.loading
    } finally {
      this.loading = null
    }
  }

  /** Persist a new accent choice and apply it immediately. */
  async setAccent(key: AccentKey): Promise<void> {
    await Preferences.set({ key: PREF_KEY, value: key })
    this.accentSignal.set(key)
    this.applyAccent(key)
  }

  private async load(): Promise<void> {
    const { value } = await Preferences.get({ key: PREF_KEY })
    const key = isAccentKey(value) ? value : DEFAULT_ACCENT
    this.accentSignal.set(key)
    this.applyAccent(key)
    this.attachDarkObserver()
  }

  private applyAccent(key: AccentKey): void {
    const isDark = document.documentElement.classList.contains(DARK_CLASS)
    const override = isDark ? ACCENTS_DARK_OVERRIDE[key] : undefined
    const def: AccentDef = override ?? ACCENTS[key]
    this.writeCssVars(def)
  }

  private writeCssVars(def: AccentDef): void {
    const el = document.documentElement
    const rgb = hexToRgbTuple(def.base)
    const inkRgb = hexToRgbTuple(def.ink)
    const shadedBase = shade(def.base, 12)
    const tintedBase = tint(def.base, 12)

    el.style.setProperty('--hnch-accent', def.base)
    el.style.setProperty('--hnch-accent-rgb', rgb)
    el.style.setProperty('--hnch-accent-soft', def.soft)
    el.style.setProperty('--hnch-accent-ink', def.ink)

    el.style.setProperty('--ion-color-primary', def.base)
    el.style.setProperty('--ion-color-primary-rgb', rgb)
    el.style.setProperty('--ion-color-primary-contrast', def.ink)
    el.style.setProperty('--ion-color-primary-contrast-rgb', inkRgb)
    el.style.setProperty('--ion-color-primary-shade', shadedBase)
    el.style.setProperty('--ion-color-primary-tint', tintedBase)
  }

  private attachDarkObserver(): void {
    this.darkObserver?.disconnect()
    this.lastIsDark = document.documentElement.classList.contains(DARK_CLASS)
    this.darkObserver = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains(DARK_CLASS)
      if (isDark === this.lastIsDark) return
      this.lastIsDark = isDark
      this.applyAccent(this.accentSignal())
    })
    this.darkObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }
}

function isAccentKey(value: string | null): value is AccentKey {
  if (!value) return false
  return value in ACCENTS
}
