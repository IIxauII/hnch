// Exercises: settings.helpers:isValidTheme, isValidAccent, relayUrlDisplayLabel
// Exercises: SettingsPage:scaleLabel (custom-scale label resolution)

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { CustomScale, Scale } from '@hnch/shared';

import { ACCENTS } from '../core/accent.tokens';
import { isValidAccent, isValidTheme, relayUrlDisplayLabel } from './settings.helpers';

// ---------------------------------------------------------------------------
// isValidTheme
// ---------------------------------------------------------------------------

describe('isValidTheme', () => {
  it('accepts "system"', () => {
    expect(isValidTheme('system')).toBe(true);
  });

  it('accepts "light"', () => {
    expect(isValidTheme('light')).toBe(true);
  });

  it('accepts "dark"', () => {
    expect(isValidTheme('dark')).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidTheme(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidTheme(undefined)).toBe(false);
  });

  it('rejects an arbitrary string', () => {
    expect(isValidTheme('midnight')).toBe(false);
    expect(isValidTheme('')).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidTheme(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidAccent
// ---------------------------------------------------------------------------

describe('isValidAccent', () => {
  it('accepts all keys present in ACCENTS', () => {
    for (const key of Object.keys(ACCENTS)) {
      expect(isValidAccent(key)).toBe(true);
    }
  });

  it('rejects null', () => {
    expect(isValidAccent(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidAccent(undefined)).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(isValidAccent('neon-pink')).toBe(false);
    expect(isValidAccent('')).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidAccent(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// relayUrlDisplayLabel
// ---------------------------------------------------------------------------

describe('relayUrlDisplayLabel', () => {
  it('returns the URL when a relay URL override is set', () => {
    expect(relayUrlDisplayLabel('http://localhost:1234')).toBe('http://localhost:1234');
  });

  it('returns "Default" when no relay URL override is set (null)', () => {
    expect(relayUrlDisplayLabel(null)).toBe('Default');
  });

  it('returns "Default" when relay URL override is empty string', () => {
    expect(relayUrlDisplayLabel('')).toBe('Default');
  });

  it('returns "Default" when relay URL override is undefined', () => {
    expect(relayUrlDisplayLabel(undefined)).toBe('Default');
  });
});

// ---------------------------------------------------------------------------
// SettingsPage.scaleLabel
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});
  return {
    IonBackButton: stub('ion-back-button'),
    IonButtons: stub('ion-buttons'),
    IonCol: stub('ion-col'),
    IonContent: stub('ion-content'),
    IonGrid: stub('ion-grid'),
    IonHeader: stub('ion-header'),
    IonIcon: stub('ion-icon'),
    IonInput: stub('ion-input'),
    IonItem: stub('ion-item'),
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonModal: stub('ion-modal'),
    IonNote: stub('ion-note'),
    IonRow: stub('ion-row'),
    IonSelect: stub('ion-select'),
    IonSelectOption: stub('ion-select-option'),
    IonTitle: stub('ion-title'),
    IonToggle: stub('ion-toggle'),
    IonToolbar: stub('ion-toolbar'),
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({}));
vi.mock('../session-settings/scale-picker.sheet', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-scale-picker-sheet', template: '', standalone: true })
  class ScalePickerSheetComponent {}
  return { ScalePickerSheetComponent };
});
vi.mock('./relay-url-editor.sheet', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-relay-url-editor-sheet', template: '', standalone: true })
  class RelayUrlEditorSheetComponent {}
  return { RelayUrlEditorSheetComponent };
});

async function mountSettings(scale: Scale, customs: CustomScale[]) {
  const { AccentService } = await import('../core/accent.service');
  const { AppPreferenceService } = await import('../core/app-preference.service');
  const { DocService } = await import('../core/doc/doc.service');
  const { DisplayNameService } = await import('../core/display-name.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { ScalePreferenceService } = await import('../core/scale-preference.service');
  const { ThemeService } = await import('../core/theme.service');
  const { SurfaceService } = await import('../core/surface.service');

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AccentService, useValue: { current: signal('blue').asReadonly(), set: vi.fn() } },
      { provide: AppPreferenceService, useValue: { relayHttpUrl: signal(null).asReadonly() } },
      { provide: DocService, useValue: {} },
      {
        provide: DisplayNameService,
        useValue: {
          current: signal('Host').asReadonly(),
          getDisplayName: vi.fn().mockResolvedValue('Host'),
          setDisplayName: vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
      {
        provide: ScalePreferenceService,
        useValue: {
          defaultScale: signal(scale).asReadonly(),
          defaultScaleId: signal(scale.id).asReadonly(),
          customScales: signal(customs).asReadonly(),
        },
      },
      { provide: ThemeService, useValue: { current: signal('system').asReadonly() } },
      {
        provide: SurfaceService,
        useValue: {
          mode: signal('mobile').asReadonly(),
          sheetBreakpoints: () => [0, 0.5, 1],
          initialSheetBreakpoint: () => 0.5,
          sheetBreakpointsFull: () => [0, 0.6, 1],
          initialSheetBreakpointFull: () => 1,
        },
      },
    ],
  });

  const { SettingsPage } = await import('./settings.page');
  return TestBed.createComponent(SettingsPage);
}

describe('SettingsPage — scaleLabel (default scale)', () => {
  it('returns the custom label when default scale is a known custom scale', async () => {
    const fixture = await mountSettings({ id: 'custom-bananas', cards: ['1', '2'] }, [
      { id: 'custom-bananas', label: 'Team Bananas', cards: ['1', '2'] },
    ]);
    const label = (
      fixture.componentInstance as unknown as { scaleLabel: () => string }
    ).scaleLabel();
    expect(label).toBe('Team Bananas');
  });

  it('falls back to formatted id when the custom label is blank', async () => {
    const fixture = await mountSettings({ id: 'custom-no-label', cards: ['1'] }, [
      { id: 'custom-no-label', label: '', cards: ['1'] },
    ]);
    const label = (
      fixture.componentInstance as unknown as { scaleLabel: () => string }
    ).scaleLabel();
    expect(label).toBe('No Label');
  });

  it('returns the builtin display name for a builtin scale', async () => {
    const fixture = await mountSettings({ id: 'fibonacci', cards: ['0', '1'] }, []);
    const label = (
      fixture.componentInstance as unknown as { scaleLabel: () => string }
    ).scaleLabel();
    expect(label).toBe('Fibonacci');
  });
});
