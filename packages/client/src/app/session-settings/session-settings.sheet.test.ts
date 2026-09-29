// Exercises: SessionSettingsSheetComponent — scaleLabel (custom-scale label
// resolution), host gating, and the password row. The access change itself
// is `SessionAccessService`'s (core/session-access.service.test.ts); what is
// the sheet's is what it asks for, and what it says about how it went.

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { CustomScale, Scale, Settings } from '@hnch/shared';

import { DocService } from '../core/doc/doc.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import type { AccessChangeResult } from '../core/session-access.service';
import { SessionAccessService } from '../core/session-access.service';
import { SurfaceService } from '../core/surface.service';
import { ToastService } from '../services/toast.service';
import { accessHint, passwordPlaceholder } from './session-settings.helpers';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});

  @Comp({ selector: 'ion-input', template: '<ng-content/>', standalone: true })
  class IonInput {
    @Input() value: unknown;
    @Input() type: string | undefined;
    @Input() label: string | undefined;
    @Input() labelPlacement: string | undefined;
    @Input() placeholder: string | undefined;
    @Input() disabled: boolean | undefined;
  }
  @Comp({ selector: 'ion-modal', template: '<ng-content/>', standalone: true })
  class IonModal {
    @Input() isOpen: boolean | undefined;
    @Input() cssClass: string | undefined;
    @Input() breakpoints: number[] | undefined;
    @Input() initialBreakpoint: number | undefined;
  }
  @Comp({ selector: 'ion-item', template: '<ng-content/>', standalone: true })
  class IonItem {
    @Input() button: boolean | string | undefined;
    @Input() detail: boolean | string | undefined;
    @Input() disabled: boolean | undefined;
  }
  @Comp({ selector: 'ion-button', template: '<ng-content/>', standalone: true })
  class IonButton {
    @Input() disabled: boolean | undefined;
    @Input() fill: string | undefined;
    @Input() color: string | undefined;
    @Input() strong: boolean | string | undefined;
  }

  return {
    IonButton,
    IonButtons: stub('ion-buttons'),
    IonContent: stub('ion-content'),
    IonHeader: stub('ion-header'),
    // IonIcon + IonListHeader are not used by the sheet itself — importing
    // SurfaceService pulls in MenuPopoverComponent, which is.
    IonIcon: stub('ion-icon'),
    IonInput,
    IonInputPasswordToggle: stub('ion-input-password-toggle'),
    IonItem,
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonModal,
    IonNote: stub('ion-note'),
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
  };
});
vi.mock('./scale-picker.sheet', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-scale-picker-sheet', template: '', standalone: true })
  class ScalePickerSheetComponent {}
  return { ScalePickerSheetComponent };
});
interface Harness {
  updateSettings: ReturnType<typeof vi.fn>;
  /** Passwords handed to the service, as they were handed over. */
  passwordsSet: string[];
  removals: number;
  toastInfo: ReturnType<typeof vi.fn>;
  toastError: ReturnType<typeof vi.fn>;
}

interface SheetInternals {
  scaleLabel: () => string;
  passwordDraft: { (): string; set: (v: string) => void };
  savingAccess: () => boolean;
  onPasswordCommit: () => Promise<void>;
  onRemovePassword: () => Promise<void>;
  onScaleSelected: (scale: Scale) => void;
}

async function mountSheet(
  scale: Scale | undefined,
  customs: CustomScale[],
  inputs: {
    isHost?: boolean;
    accessMode?: 'open' | 'password';
    /** How the relay answers a change. Default: it takes it. */
    result?: AccessChangeResult;
    /** Resolve the change only when the test says so. */
    held?: Promise<void>;
  } = {},
) {
  TestBed.resetTestingModule();
  const settingsSignal = signal<Partial<Settings> | undefined>(
    scale ? { defaultScale: scale } : undefined,
  );
  const mode = signal<'open' | 'password'>(inputs.accessMode ?? 'open');
  const saving = signal(false);
  const harness: Harness = {
    updateSettings: vi.fn(),
    passwordsSet: [],
    removals: 0,
    toastInfo: vi.fn().mockResolvedValue(undefined),
    toastError: vi.fn().mockResolvedValue(undefined),
  };
  const answer = async (): Promise<AccessChangeResult> => {
    saving.set(true);
    if (inputs.held !== undefined) await inputs.held;
    saving.set(false);
    return inputs.result ?? 'applied';
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ScalePreferenceService,
        useValue: { customScales: signal(customs).asReadonly() },
      },
      {
        provide: DocService,
        useValue: {
          settings: settingsSignal.asReadonly(),
          updateSettings: harness.updateSettings,
        },
      },
      {
        provide: SessionAccessService,
        useValue: {
          mode: mode.asReadonly(),
          saving: saving.asReadonly(),
          setPassword: (password: string) => {
            harness.passwordsSet.push(password);
            return answer();
          },
          removePassword: () => {
            harness.removals += 1;
            return answer();
          },
        },
      },
      { provide: ToastService, useValue: { info: harness.toastInfo, error: harness.toastError } },
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
  fixture.componentRef.setInput('isHost', inputs.isHost ?? true);
  fixture.detectChanges();
  return {
    fixture,
    harness,
    mode,
    sheet: fixture.componentInstance as unknown as SheetInternals,
  };
}

const FIB: Scale = { id: 'fibonacci', cards: ['0', '1'] };

describe('SessionSettingsSheetComponent — scaleLabel', () => {
  it('returns the custom label when defaultScale is a known custom scale', async () => {
    const { sheet } = await mountSheet({ id: 'custom-bananas', cards: ['1', '2'] }, [
      { id: 'custom-bananas', label: 'Team Bananas', cards: ['1', '2'] },
    ]);
    expect(sheet.scaleLabel()).toBe('Team Bananas');
  });

  it('falls back to formatted id when the custom label is blank', async () => {
    const { sheet } = await mountSheet({ id: 'custom-no-label', cards: ['1'] }, [
      { id: 'custom-no-label', label: '', cards: ['1'] },
    ]);
    expect(sheet.scaleLabel()).toBe('No Label');
  });

  it('returns the builtin display name for a builtin scale', async () => {
    const { sheet } = await mountSheet(FIB, []);
    expect(sheet.scaleLabel()).toBe('Fibonacci');
  });

  it('returns empty string when settings are not yet loaded', async () => {
    const { sheet } = await mountSheet(undefined, []);
    expect(sheet.scaleLabel()).toBe('');
  });
});

describe('SessionSettingsSheetComponent — setting a password', () => {
  it('hands the password over and says so once the relay has taken it', async () => {
    const { sheet, harness } = await mountSheet(FIB, []);
    sheet.passwordDraft.set('hunter2');

    await sheet.onPasswordCommit();

    expect(harness.passwordsSet).toEqual(['hunter2']);
    expect(harness.toastInfo).toHaveBeenCalledWith('Password set');
    expect(harness.toastError).not.toHaveBeenCalled();
  });

  it('a blank field changes nothing — it never opens a protected session', async () => {
    const { sheet, harness } = await mountSheet(FIB, [], { accessMode: 'password' });

    for (const blank of ['', '   ', '\t\n']) {
      sheet.passwordDraft.set(blank);
      await sheet.onPasswordCommit();
    }

    expect(harness.passwordsSet).toEqual([]);
    expect(harness.removals).toBe(0);
    expect(harness.toastInfo).not.toHaveBeenCalled();
  });

  it('says so when the relay refuses', async () => {
    const { sheet, harness } = await mountSheet(FIB, [], { result: 'failed' });
    sheet.passwordDraft.set('hunter2');

    await sheet.onPasswordCommit();

    expect(harness.toastError).toHaveBeenCalledWith("Couldn't update the password. Try again.");
    expect(harness.toastInfo).not.toHaveBeenCalled();
  });

  it('says nothing when there was nothing to send', async () => {
    const { sheet, harness } = await mountSheet(FIB, [], { result: 'skipped' });
    sheet.passwordDraft.set('hunter2');

    await sheet.onPasswordCommit();

    expect(harness.toastInfo).not.toHaveBeenCalled();
    expect(harness.toastError).not.toHaveBeenCalled();
  });

  // The relay holds a hash and so does the device. The field is for typing a
  // password into, not for reading one back.
  it('never shows a password back: the field is empty again once it is handed over', async () => {
    const { sheet } = await mountSheet(FIB, []);
    sheet.passwordDraft.set('hunter2');

    await sheet.onPasswordCommit();

    expect(sheet.passwordDraft()).toBe('');
  });

  it('starts with an empty field, protected session or not', async () => {
    expect((await mountSheet(FIB, [], { accessMode: 'password' })).sheet.passwordDraft()).toBe('');
    expect((await mountSheet(FIB, [], { accessMode: 'open' })).sheet.passwordDraft()).toBe('');
  });

  it('does not start a second change while one is on its way', async () => {
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sheet, harness } = await mountSheet(FIB, [], { held });
    sheet.passwordDraft.set('hunter2');
    const first = sheet.onPasswordCommit();
    await vi.waitFor(() => expect(sheet.savingAccess()).toBe(true));

    sheet.passwordDraft.set('other');
    await sheet.onPasswordCommit();
    await sheet.onRemovePassword();

    release();
    await first;
    expect(harness.passwordsSet).toEqual(['hunter2']);
    expect(harness.removals).toBe(0);
  });

  // The field saves on blur, and what blurs it is the tap on Done: the sheet
  // is gone before the relay has answered. The change must go through and be
  // reported all the same.
  it('sees a change through when the sheet is closed before the relay has answered', async () => {
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { fixture, sheet, harness } = await mountSheet(FIB, [], { held });
    sheet.passwordDraft.set('hunter2');
    const change = sheet.onPasswordCommit();

    fixture.destroy();
    release();
    await change;

    expect(harness.passwordsSet).toEqual(['hunter2']);
    expect(harness.toastInfo).toHaveBeenCalledWith('Password set');
  });
});

describe('SessionSettingsSheetComponent — removing a password', () => {
  it('asks for the session to be opened and says so once it is', async () => {
    const { sheet, harness } = await mountSheet(FIB, [], { accessMode: 'password' });

    await sheet.onRemovePassword();

    expect(harness.removals).toBe(1);
    expect(harness.toastInfo).toHaveBeenCalledWith('Password removed');
  });

  it('clears whatever was typed into the field', async () => {
    const { sheet } = await mountSheet(FIB, [], { accessMode: 'password' });
    sheet.passwordDraft.set('half-typed');

    await sheet.onRemovePassword();

    expect(sheet.passwordDraft()).toBe('');
  });

  it('says so when the relay refuses', async () => {
    const { sheet, harness } = await mountSheet(FIB, [], {
      accessMode: 'password',
      result: 'failed',
    });

    await sheet.onRemovePassword();

    expect(harness.toastError).toHaveBeenCalledWith("Couldn't update the password. Try again.");
  });

  it('offers the Remove button only while the session is protected', async () => {
    const open = await mountSheet(FIB, [], { accessMode: 'open' });
    expect(open.fixture.nativeElement.querySelector('.remove-password-btn')).toBeNull();

    const locked = await mountSheet(FIB, [], { accessMode: 'password' });
    expect(locked.fixture.nativeElement.querySelector('.remove-password-btn')).not.toBeNull();
  });

  it('takes the button away as soon as the relay has opened the session', async () => {
    const { fixture, mode } = await mountSheet(FIB, [], { accessMode: 'password' });

    mode.set('open');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.remove-password-btn')).toBeNull();
  });
});

describe('SessionSettingsSheetComponent — host gating', () => {
  it('a non-host cannot change the scale', async () => {
    const { sheet, harness } = await mountSheet(FIB, [], { isHost: false });

    sheet.onScaleSelected({ id: 't-shirt', cards: ['S', 'M'] });

    expect(harness.updateSettings).not.toHaveBeenCalled();
  });

  it('a non-host cannot set or remove the password', async () => {
    const { sheet, harness } = await mountSheet(FIB, [], {
      isHost: false,
      accessMode: 'password',
    });
    sheet.passwordDraft.set('hunter2');

    await sheet.onPasswordCommit();
    await sheet.onRemovePassword();

    expect(harness.passwordsSet).toEqual([]);
    expect(harness.removals).toBe(0);
  });

  it('the host can change the scale', async () => {
    const { sheet, harness } = await mountSheet(FIB, []);
    const next = { id: 't-shirt', cards: ['S', 'M'] };

    sheet.onScaleSelected(next);

    expect(harness.updateSettings).toHaveBeenCalledWith({ defaultScale: next });
  });
});

describe('session-settings helpers', () => {
  it('accessHint says who can get in', () => {
    expect(accessHint('open')).toBe('No password: anyone with the code can join.');
    expect(accessHint('password')).toBe('Anyone joining needs this password as well as the code.');
  });

  it('passwordPlaceholder admits a password is set even when the field is blank', () => {
    expect(passwordPlaceholder('open')).toBe('None');
    expect(passwordPlaceholder('password')).toBe('Set. Type a new one to change it');
  });
});
