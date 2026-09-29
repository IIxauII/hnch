import { computed, Injectable, signal, type Signal, type WritableSignal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  BUILTIN_SCALES,
  buildAvailableScales,
  type CustomScale,
  type PresetOverrides,
  type Scale,
} from '@hnch/shared';

/**
 * Per-device scale customization — ADR-0019.
 *
 * Persists three blobs under Capacitor Preferences:
 *   - `hnch.presetOverrides`  — which card indices are disabled per builtin scale
 *   - `hnch.customScales`     — fully user-defined scales
 *   - `hnch.defaultScaleId`   — the default scale ID (string, defaults to 'fibonacci')
 *
 * Exposes signals so pickers and the settings page can react without
 * polling. An `APP_INITIALIZER` pre-warms {@link ensureLoaded} so every
 * screen reads synchronously after bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class ScalePreferenceService {
  static readonly PRESET_OVERRIDES_KEY = 'hnch.presetOverrides';
  static readonly CUSTOM_SCALES_KEY = 'hnch.customScales';
  static readonly DEFAULT_SCALE_ID_KEY = 'hnch.defaultScaleId';

  private readonly presetOverridesSignal = signal<PresetOverrides>({});
  private readonly customScalesSignal = signal<CustomScale[]>([]);
  private readonly defaultScaleIdSignal = signal<string>('fibonacci');

  /** Disabled card-index sets per builtin scale id. */
  readonly presetOverrides: Signal<PresetOverrides> = this.presetOverridesSignal.asReadonly();

  /** User-defined custom scales. */
  readonly customScales: Signal<CustomScale[]> = this.customScalesSignal.asReadonly();

  /** Default scale ID (stored in Preferences, defaults to 'fibonacci'). */
  readonly defaultScaleId: Signal<string> = this.defaultScaleIdSignal.asReadonly();

  /**
   * Full ordered list of scales available for picking: builtin presets
   * (with per-index overrides applied) followed by custom scales.
   * Recomputes reactively whenever either underlying signal changes.
   */
  readonly availableScales: Signal<Scale[]> = computed(() =>
    buildAvailableScales(this.presetOverridesSignal(), this.customScalesSignal()),
  );

  /**
   * The resolved default scale object, looking up the current defaultScaleId
   * against availableScales. Falls back to the Fibonacci scale if the ID is
   * not found.
   */
  readonly defaultScale: Signal<Scale> = computed(() => {
    const id = this.defaultScaleIdSignal();
    const scales = this.availableScales();
    const found = scales.find((s) => s.id === id);
    if (found) return found;
    const fibonacci = scales.find((s) => s.id === 'fibonacci');
    if (fibonacci) return fibonacci;
    return scales[0]!;
  });

  private loading: Promise<void> | null = null;

  /** Pre-warm from Preferences — call once via `APP_INITIALIZER`. */
  async ensureLoaded(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.load();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Toggle a single card index on/off for a builtin preset.
   *
   * If `index` is currently disabled, it is re-enabled; otherwise it is
   * added to the disabled set. Changes are flushed to Preferences
   * immediately so they survive app restart.
   *
   * A guard prevents disabling every card — at least one card must remain
   * enabled per scale.
   */
  async togglePresetCard(scaleId: string, index: number): Promise<void> {
    const builtin = BUILTIN_SCALES[scaleId];
    if (!builtin) return;
    if (index < 0 || index >= builtin.cards.length) return;

    const current = { ...this.presetOverridesSignal() };
    const disabled = [...(current[scaleId] ?? [])];
    const pos = disabled.indexOf(index);

    if (pos !== -1) {
      // Re-enable: remove from disabled list
      disabled.splice(pos, 1);
    } else {
      // Disable: add to list, but never disable the last enabled card
      const wouldBeDisabledCount = disabled.length + 1;
      if (wouldBeDisabledCount >= builtin.cards.length) return;
      disabled.push(index);
    }

    if (disabled.length === 0) {
      delete current[scaleId];
    } else {
      current[scaleId] = disabled;
    }

    await this.store(
      this.presetOverridesSignal,
      current,
      ScalePreferenceService.PRESET_OVERRIDES_KEY,
      JSON.stringify(current),
    );
  }

  /**
   * Append a new custom scale. The `id` is auto-generated with the
   * `custom-` prefix; the caller provides `label` and `cards`.
   *
   * Returns the minted id so the caller can immediately reference the
   * new scale (e.g. set it as the session default).
   */
  async addCustomScale(label: string, cards: string[]): Promise<string> {
    const id = `custom-${crypto.randomUUID()}`;
    const entry: CustomScale = { id, label, cards };
    const updated = [...this.customScalesSignal(), entry];
    await this.storeCustomScales(updated);
    return id;
  }

  /**
   * Update an existing custom scale's label and cards in place.
   *
   * The `id` is never changed, so any `defaultScale` references in open
   * sessions continue to resolve correctly. No-ops silently if the id is
   * not found.
   */
  async updateCustomScale(id: string, label: string, cards: string[]): Promise<void> {
    const current = this.customScalesSignal();
    const idx = current.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const updated = current.map((s) => (s.id === id ? Object.assign({}, s, { label, cards }) : s));
    await this.storeCustomScales(updated);
  }

  /**
   * Remove a custom scale by id. No-ops silently if the id is not found
   * (idempotent — safe to call after optimistic UI removal).
   *
   * A default that pointed at the scale goes back to Fibonacci — which is
   * what `defaultScale` resolved a dangling id to anyway, except that the
   * picker then had nothing checked.
   */
  async deleteCustomScale(id: string): Promise<void> {
    const updated = this.customScalesSignal().filter((s) => s.id !== id);
    if (updated.length === this.customScalesSignal().length) return;
    await this.storeCustomScales(updated);
    if (this.defaultScaleIdSignal() === id) await this.setDefaultScaleId('fibonacci');
  }

  /**
   * Set the default scale ID. The ID is persisted to Capacitor Preferences
   * and the signal is updated so dependent screens react immediately.
   */
  async setDefaultScaleId(id: string): Promise<void> {
    await this.store(
      this.defaultScaleIdSignal,
      id,
      ScalePreferenceService.DEFAULT_SCALE_ID_KEY,
      id,
    );
  }

  private storeCustomScales(scales: CustomScale[]): Promise<void> {
    return this.store(
      this.customScalesSignal,
      scales,
      ScalePreferenceService.CUSTOM_SCALES_KEY,
      JSON.stringify(scales),
    );
  }

  /**
   * Show `next` and store it. Shown at once, so that the screen does not
   * wait for the device; but what is shown has to be what is stored, or the
   * next start of the app takes it back without a word. A write that fails
   * takes the change back — unless something newer is shown by then — and
   * fails for the caller, who can say so.
   */
  private async store<T>(
    state: WritableSignal<T>,
    next: T,
    key: string,
    value: string,
  ): Promise<void> {
    const before = state();
    state.set(next);
    try {
      await Preferences.set({ key, value });
    } catch (err) {
      if (state() === next) state.set(before);
      throw err;
    }
  }

  private async load(): Promise<void> {
    const [overridesResult, customsResult, defaultIdResult] = await Promise.all([
      Preferences.get({ key: ScalePreferenceService.PRESET_OVERRIDES_KEY }),
      Preferences.get({ key: ScalePreferenceService.CUSTOM_SCALES_KEY }),
      Preferences.get({ key: ScalePreferenceService.DEFAULT_SCALE_ID_KEY }),
    ]);

    if (overridesResult.value) {
      const parsed = tryParse(overridesResult.value);
      if (isPresetOverrides(parsed)) {
        this.presetOverridesSignal.set(parsed);
      }
    }

    if (customsResult.value) {
      const parsed = tryParse(customsResult.value);
      if (isCustomScaleArray(parsed)) {
        this.customScalesSignal.set(parsed);
      }
    }

    if (defaultIdResult.value) {
      // A default that points at a scale that is no longer there is no
      // default: `defaultScale` would resolve it to Fibonacci while the
      // picker, which goes by the id, showed nothing checked.
      const id = defaultIdResult.value;
      const known = this.availableScales().some((s) => s.id === id);
      this.defaultScaleIdSignal.set(known ? id : 'fibonacci');
    }
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isPresetOverrides(v: unknown): v is PresetOverrides {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (arr) => Array.isArray(arr) && (arr as unknown[]).every((n) => typeof n === 'number'),
  );
}

function isCustomScale(v: unknown): v is CustomScale {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    o['id'].startsWith('custom-') &&
    typeof o['label'] === 'string' &&
    Array.isArray(o['cards']) &&
    (o['cards'] as unknown[]).every((c) => typeof c === 'string')
  );
}

function isCustomScaleArray(v: unknown): v is CustomScale[] {
  return Array.isArray(v) && v.every(isCustomScale);
}
