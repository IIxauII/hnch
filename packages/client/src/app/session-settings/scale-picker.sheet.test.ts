// Exercises: scale-picker.helpers:previewCards
// Exercises: scale-picker.helpers:previewBuiltinCards
// Exercises: ScalePickerSheetComponent:formatId (custom-scale label resolution)

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { CustomScale } from '@hnch/shared';

import { previewCards, previewBuiltinCards } from './scale-picker.helpers';
import { HapticService } from '../core/haptic.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { SurfaceService } from '../core/surface.service';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});

  @Comp({ selector: 'ion-radio-group', template: '<ng-content/>', standalone: true })
  class IonRadioGroup {
    @Input() value: string | null | undefined;
  }
  @Comp({ selector: 'ion-radio', template: '', standalone: true })
  class IonRadio {
    @Input() value: string | undefined;
  }
  @Comp({ selector: 'ion-modal', template: '<ng-content/>', standalone: true })
  class IonModal {
    @Input() isOpen: boolean | undefined;
  }
  @Comp({ selector: 'ion-item', template: '<ng-content/>', standalone: true })
  class IonItem {
    @Input() button: boolean | undefined;
    @Input() lines: string | undefined;
  }
  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {
    @Input() name: string | undefined;
    @Input() slot: string | undefined;
  }

  return {
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonContent: stub('ion-content'),
    IonHeader: stub('ion-header'),
    IonIcon,
    IonItem,
    IonItemOption: stub('ion-item-option'),
    IonItemOptions: stub('ion-item-options'),
    IonItemSliding: stub('ion-item-sliding'),
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonModal,
    IonNote: stub('ion-note'),
    IonRadio,
    IonRadioGroup,
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ addOutline: '', createOutline: '', trashOutline: '' }));
vi.mock('./custom-scale-editor.sheet', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-custom-scale-editor-sheet', template: '', standalone: true })
  class CustomScaleEditorSheetComponent {}
  return { CustomScaleEditorSheetComponent };
});
vi.mock('./scale-editor.sheet', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-scale-editor-sheet', template: '', standalone: true })
  class ScaleEditorSheetComponent {}
  return { ScaleEditorSheetComponent };
});

async function mountPicker(customs: CustomScale[]) {
  TestBed.resetTestingModule();
  const customsSignal = signal(customs);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ScalePreferenceService,
        useValue: {
          customScales: customsSignal.asReadonly(),
          presetOverrides: signal({}).asReadonly(),
          availableScales: signal([]).asReadonly(),
        },
      },
      { provide: HapticService, useValue: { impactLight: vi.fn() } },
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
  const { ScalePickerSheetComponent } = await import('./scale-picker.sheet');
  const fixture = TestBed.createComponent(ScalePickerSheetComponent);
  fixture.detectChanges();
  return fixture;
}

describe('previewCards', () => {
  it('joins cards with " · " separator', () => {
    expect(previewCards(['0', '1', '2', '3', '5', '8'])).toBe('0 · 1 · 2 · 3 · 5 · 8');
  });

  it('returns the single card unchanged', () => {
    expect(previewCards(['XL'])).toBe('XL');
  });

  it('returns empty string for an empty array', () => {
    expect(previewCards([])).toBe('');
  });
});

describe('previewBuiltinCards — no overrides', () => {
  it('shows all fibonacci cards when no override exists', () => {
    expect(previewBuiltinCards('fibonacci', {})).toBe('0 · 1 · 2 · 3 · 5 · 8 · 13 · 21');
  });

  it('shows all t-shirt cards when no override exists', () => {
    expect(previewBuiltinCards('t-shirt', {})).toBe('XS · S · M · L · XL');
  });

  it('returns empty string for unknown scale ID', () => {
    expect(previewBuiltinCards('does-not-exist', {})).toBe('');
  });
});

describe('previewBuiltinCards — with overrides (disabled cards)', () => {
  it('omits cards at a single disabled index', () => {
    // Disable index 0 ('0') from fibonacci
    expect(previewBuiltinCards('fibonacci', { fibonacci: [0] })).toBe(
      '1 · 2 · 3 · 5 · 8 · 13 · 21',
    );
  });

  it('omits multiple disabled cards', () => {
    // Disable indices 0 ('0') and 7 ('21') from fibonacci
    expect(previewBuiltinCards('fibonacci', { fibonacci: [0, 7] })).toBe('1 · 2 · 3 · 5 · 8 · 13');
  });

  it('overrides for a different scale do not affect the queried scale', () => {
    expect(previewBuiltinCards('fibonacci', { 't-shirt': [0] })).toBe(
      '0 · 1 · 2 · 3 · 5 · 8 · 13 · 21',
    );
  });

  it('single card remaining after overrides', () => {
    // Disable all fibonacci except index 4 ('5')
    expect(previewBuiltinCards('fibonacci', { fibonacci: [0, 1, 2, 3, 5, 6, 7] })).toBe('5');
  });
});

describe('ScalePickerSheetComponent — formatId', () => {
  it('returns the custom label for a known custom scale', async () => {
    const fixture = await mountPicker([
      { id: 'custom-bananas', label: 'Team Bananas', cards: ['1', '2'] },
    ]);
    const formatId = (fixture.componentInstance as unknown as { formatId: (id: string) => string })
      .formatId;
    expect(formatId('custom-bananas')).toBe('Team Bananas');
  });

  it('falls back to the formatted id when the custom label is blank', async () => {
    const fixture = await mountPicker([{ id: 'custom-no-label', label: '', cards: ['1'] }]);
    const formatId = (fixture.componentInstance as unknown as { formatId: (id: string) => string })
      .formatId;
    expect(formatId('custom-no-label')).toBe('No Label');
  });

  it('returns the builtin display name for a builtin id', async () => {
    const fixture = await mountPicker([]);
    const formatId = (fixture.componentInstance as unknown as { formatId: (id: string) => string })
      .formatId;
    expect(formatId('fibonacci')).toBe('Fibonacci');
  });
});
