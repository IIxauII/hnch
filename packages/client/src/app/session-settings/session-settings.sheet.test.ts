// Exercises: SessionSettingsSheetComponent:scaleLabel (custom-scale label resolution)

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { CustomScale, Scale, SessionSettings } from '@hnch/shared';

import { AppPreferenceService } from '../core/app-preference.service';
import { DocService } from '../core/doc/doc.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { SurfaceService } from '../core/surface.service';
import { ToastService } from '../services/toast.service';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});

  @Comp({ selector: 'ion-input', template: '', standalone: true })
  class IonInput {
    @Input() value: unknown;
    @Input() type: string | undefined;
    @Input() placeholder: string | undefined;
    @Input() disabled: boolean | undefined;
    @Input() clearInput: boolean | undefined;
  }
  @Comp({ selector: 'ion-modal', template: '<ng-content/>', standalone: true })
  class IonModal {
    @Input() isOpen: boolean | undefined;
  }
  @Comp({ selector: 'ion-item', template: '<ng-content/>', standalone: true })
  class IonItem {
    @Input() button: boolean | undefined;
    @Input() disabled: boolean | undefined;
    @Input() lines: string | undefined;
  }
  @Comp({ selector: 'ion-label', template: '<ng-content/>', standalone: true })
  class IonLabel {
    @Input() position: string | undefined;
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
    IonInput,
    IonItem,
    IonLabel,
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonModal,
    IonNote: stub('ion-note'),
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ 'chevron-forward-outline': '', chevronForwardOutline: '' }));
vi.mock('./access-picker.sheet', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-access-picker-sheet', template: '', standalone: true })
  class AccessPickerSheetComponent {}
  return { AccessPickerSheetComponent };
});
vi.mock('./scale-picker.sheet', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-scale-picker-sheet', template: '', standalone: true })
  class ScalePickerSheetComponent {}
  return { ScalePickerSheetComponent };
});

async function mountSheet(scale: Scale | undefined, customs: CustomScale[]) {
  TestBed.resetTestingModule();
  const settingsSignal = signal<Partial<SessionSettings> | undefined>(
    scale ? { defaultScale: scale } : undefined,
  );
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ScalePreferenceService,
        useValue: { customScales: signal(customs).asReadonly() },
      },
      { provide: DocService, useValue: { settings: settingsSignal.asReadonly() } },
      { provide: AppPreferenceService, useValue: {} },
      { provide: ToastService, useValue: { show: vi.fn() } },
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
  const { SessionSettingsSheetComponent } = await import('./session-settings.sheet');
  const fixture = TestBed.createComponent(SessionSettingsSheetComponent);
  fixture.detectChanges();
  return fixture;
}

describe('SessionSettingsSheetComponent — scaleLabel', () => {
  it('returns the custom label when defaultScale is a known custom scale', async () => {
    const fixture = await mountSheet({ id: 'custom-bananas', cards: ['1', '2'] }, [
      { id: 'custom-bananas', label: 'Team Bananas', cards: ['1', '2'] },
    ]);
    const label = (
      fixture.componentInstance as unknown as { scaleLabel: () => string }
    ).scaleLabel();
    expect(label).toBe('Team Bananas');
  });

  it('falls back to formatted id when the custom label is blank', async () => {
    const fixture = await mountSheet({ id: 'custom-no-label', cards: ['1'] }, [
      { id: 'custom-no-label', label: '', cards: ['1'] },
    ]);
    const label = (
      fixture.componentInstance as unknown as { scaleLabel: () => string }
    ).scaleLabel();
    expect(label).toBe('No Label');
  });

  it('returns the builtin display name for a builtin scale', async () => {
    const fixture = await mountSheet({ id: 'fibonacci', cards: ['0', '1'] }, []);
    const label = (
      fixture.componentInstance as unknown as { scaleLabel: () => string }
    ).scaleLabel();
    expect(label).toBe('Fibonacci');
  });

  it('returns empty string when settings are not yet loaded', async () => {
    const fixture = await mountSheet(undefined, []);
    const label = (
      fixture.componentInstance as unknown as { scaleLabel: () => string }
    ).scaleLabel();
    expect(label).toBe('');
  });
});
