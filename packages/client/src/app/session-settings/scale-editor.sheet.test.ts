// Exercises: scale-editor.helpers:computeCardRows
// Exercises: ScaleEditorSheetComponent:title (custom-scale label resolution)

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { CustomScale } from '@hnch/shared';

import { computeCardRows } from './scale-editor.helpers';
import { HapticService } from '../core/haptic.service';
import { ScalePreferenceService } from '../core/scale-preference.service';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});

  @Comp({ selector: 'ion-toggle', template: '', standalone: true })
  class IonToggle {
    @Input() checked: boolean | undefined;
    @Input() disabled: boolean | undefined;
  }

  return {
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonContent: stub('ion-content'),
    IonHeader: stub('ion-header'),
    IonItem: stub('ion-item'),
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    IonNote: stub('ion-note'),
    IonTitle: stub('ion-title'),
    IonToggle,
    IonToolbar: stub('ion-toolbar'),
  };
});

async function mountEditor(scaleId: string, customs: CustomScale[]) {
  TestBed.resetTestingModule();
  const customsSignal = signal(customs);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ScalePreferenceService,
        useValue: {
          customScales: customsSignal.asReadonly(),
          presetOverrides: signal({}).asReadonly(),
          togglePresetCard: vi.fn(),
        },
      },
      { provide: HapticService, useValue: { impactLight: vi.fn() } },
    ],
  });
  const { ScaleEditorSheetComponent } = await import('./scale-editor.sheet');
  const fixture = TestBed.createComponent(ScaleEditorSheetComponent);
  fixture.componentRef.setInput('scaleId', scaleId);
  fixture.detectChanges();
  return fixture;
}

describe('computeCardRows — unknown scaleId', () => {
  it('returns empty array for an unknown scale ID', () => {
    expect(computeCardRows('does-not-exist', [])).toEqual([]);
  });
});

describe('computeCardRows — no overrides', () => {
  it('fibonacci: all 8 cards enabled, none have disableToggle', () => {
    const rows = computeCardRows('fibonacci', []);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.enabled)).toBe(true);
    expect(rows.every((r) => !r.disableToggle)).toBe(true);
  });

  it('t-shirt: all 5 cards enabled', () => {
    const rows = computeCardRows('t-shirt', []);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.enabled)).toBe(true);
  });

  it('rows carry correct face values in order', () => {
    const rows = computeCardRows('fibonacci', []);
    expect(rows.map((r) => r.face)).toEqual(['0', '1', '2', '3', '5', '8', '13', '21']);
  });

  it('rows carry zero-based sequential indexes', () => {
    const rows = computeCardRows('fibonacci', []);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('computeCardRows — one card disabled', () => {
  it('disabled card has enabled=false and disableToggle=false', () => {
    const rows = computeCardRows('fibonacci', [0]); // disable '0'
    expect(rows[0]!.enabled).toBe(false);
    expect(rows[0]!.disableToggle).toBe(false);
  });

  it('remaining enabled cards do NOT have disableToggle when >1 enabled remain', () => {
    const rows = computeCardRows('fibonacci', [0]);
    const enabledRows = rows.filter((r) => r.enabled);
    expect(enabledRows.length).toBe(7);
    expect(enabledRows.every((r) => !r.disableToggle)).toBe(true);
  });
});

describe('computeCardRows — last remaining enabled card is locked', () => {
  const allButLast = [0, 1, 2, 3, 4, 5, 6];

  it('last enabled card has disableToggle=true', () => {
    const rows = computeCardRows('fibonacci', allButLast);
    const lastCard = rows[7]!;
    expect(lastCard.enabled).toBe(true);
    expect(lastCard.disableToggle).toBe(true);
  });

  it('disabled cards do NOT get disableToggle even when only one enabled remains', () => {
    const rows = computeCardRows('fibonacci', allButLast);
    const disabledRows = rows.filter((r) => !r.enabled);
    expect(disabledRows.every((r) => !r.disableToggle)).toBe(true);
  });

  it('exactly one card has disableToggle=true', () => {
    const rows = computeCardRows('fibonacci', allButLast);
    const locked = rows.filter((r) => r.disableToggle);
    expect(locked).toHaveLength(1);
    expect(locked[0]!.face).toBe('21');
  });
});

describe('computeCardRows — two cards remaining', () => {
  it('neither card has disableToggle when exactly two are enabled', () => {
    const rows = computeCardRows('fibonacci', [0, 1, 2, 3, 4, 5]);
    const enabledRows = rows.filter((r) => r.enabled);
    expect(enabledRows).toHaveLength(2);
    expect(enabledRows.every((r) => !r.disableToggle)).toBe(true);
  });
});

describe('ScaleEditorSheetComponent — title', () => {
  it('renders the formatted builtin name for a builtin scale id', async () => {
    const fixture = await mountEditor('fibonacci', []);
    const title = (fixture.componentInstance as unknown as { title: () => string }).title();
    expect(title).toBe('Fibonacci');
  });

  it('renders the custom scale label when one is supplied', async () => {
    const fixture = await mountEditor('custom-bananas', [
      { id: 'custom-bananas', label: 'Team Bananas', cards: ['1', '2', '3'] },
    ]);
    const title = (fixture.componentInstance as unknown as { title: () => string }).title();
    expect(title).toBe('Team Bananas');
  });

  it('falls back to the formatted id when the custom label is blank', async () => {
    const fixture = await mountEditor('custom-no-label', [
      { id: 'custom-no-label', label: '', cards: ['1'] },
    ]);
    const title = (fixture.componentInstance as unknown as { title: () => string }).title();
    expect(title).toBe('No Label');
  });
});
