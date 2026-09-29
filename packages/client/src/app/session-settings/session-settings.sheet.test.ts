// Exercises: SessionSettingsSheetComponent — scaleLabel (custom-scale label
// resolution), host gating, and the password row (access is relay state).

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hashPassword,
  patchRoomAccess,
  type CustomScale,
  type Scale,
  type Settings,
} from '@hnch/shared';

import { AppPreferenceService } from '../core/app-preference.service';
import { DocService } from '../core/doc/doc.service';
import { LastSessionService } from '../core/last-session.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
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
vi.mock('@hnch/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hnch/shared')>();
  return { ...actual, hashPassword: vi.fn(), patchRoomAccess: vi.fn() };
});

const hashPasswordMock = vi.mocked(hashPassword);
const patchRoomAccessMock = vi.mocked(patchRoomAccess);

interface Harness {
  updateSettings: ReturnType<typeof vi.fn>;
  updateCredentials: ReturnType<typeof vi.fn>;
  setPendingPasswordHash: ReturnType<typeof vi.fn>;
  clearPasswordHash: ReturnType<typeof vi.fn>;
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
  inputs: { isHost?: boolean; accessMode?: 'open' | 'password'; accessPassword?: string } = {},
) {
  TestBed.resetTestingModule();
  const settingsSignal = signal<Partial<Settings> | undefined>(
    scale ? { defaultScale: scale } : undefined,
  );
  const harness: Harness = {
    updateSettings: vi.fn(),
    updateCredentials: vi.fn(),
    setPendingPasswordHash: vi.fn(),
    clearPasswordHash: vi.fn().mockResolvedValue(undefined),
    toastInfo: vi.fn().mockResolvedValue(undefined),
    toastError: vi.fn().mockResolvedValue(undefined),
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
          meta: signal({ roomUuid: 'room-uuid-1' }).asReadonly(),
          updateSettings: harness.updateSettings,
          updateCredentials: harness.updateCredentials,
        },
      },
      {
        provide: LastSessionService,
        useValue: {
          setPendingPasswordHash: harness.setPendingPasswordHash,
          clearPasswordHash: harness.clearPasswordHash,
        },
      },
      {
        provide: AppPreferenceService,
        useValue: { resolvedRelayHttpUrl: () => 'http://relay.test' },
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
  fixture.componentRef.setInput('accessMode', inputs.accessMode ?? 'open');
  fixture.componentRef.setInput('accessPassword', inputs.accessPassword ?? '');
  fixture.detectChanges();
  // The draft is seeded from `accessPassword` in a microtask.
  await Promise.resolve();
  const changes: { mode: string; password: string | null }[] = [];
  fixture.componentInstance.accessChanged.subscribe((c) => changes.push(c));
  return {
    fixture,
    harness,
    changes,
    sheet: fixture.componentInstance as unknown as SheetInternals,
  };
}

const FIB: Scale = { id: 'fibonacci', cards: ['0', '1'] };

beforeEach(() => {
  hashPasswordMock.mockReset();
  patchRoomAccessMock.mockReset();
  hashPasswordMock.mockImplementation(async (password: string) => `hash(${password})`);
  patchRoomAccessMock.mockResolvedValue({ accessMode: 'password' } as never);
});

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
  it('hashes, patches the relay, re-handshakes, caches, and only then reports the change', async () => {
    const { sheet, harness, changes } = await mountSheet(FIB, []);
    sheet.passwordDraft.set('hunter2');

    await sheet.onPasswordCommit();

    expect(hashPasswordMock).toHaveBeenCalledWith('hunter2', 'room-uuid-1');
    expect(patchRoomAccessMock).toHaveBeenCalledWith(
      'http://relay.test',
      'room-uuid-1',
      'hash(hunter2)',
    );
    expect(harness.updateCredentials).toHaveBeenCalledWith('hash(hunter2)');
    expect(harness.setPendingPasswordHash).toHaveBeenCalledWith('room-uuid-1', 'hash(hunter2)');
    expect(changes).toEqual([{ mode: 'password', password: 'hunter2' }]);
    expect(harness.toastInfo).toHaveBeenCalledWith('Password set');
  });

  it('trims the password, as the join side does', async () => {
    const { sheet, changes } = await mountSheet(FIB, []);
    sheet.passwordDraft.set('  hunter2  ');

    await sheet.onPasswordCommit();

    expect(hashPasswordMock).toHaveBeenCalledWith('hunter2', 'room-uuid-1');
    expect(changes).toEqual([{ mode: 'password', password: 'hunter2' }]);
  });

  it('a blank field changes nothing — it never opens a protected session', async () => {
    const { sheet, changes } = await mountSheet(FIB, [], {
      accessMode: 'password',
      accessPassword: '',
    });
    sheet.passwordDraft.set('   ');

    await sheet.onPasswordCommit();

    expect(patchRoomAccessMock).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it('does not re-send a password that has not changed', async () => {
    const { sheet, changes } = await mountSheet(FIB, [], {
      accessMode: 'password',
      accessPassword: 'hunter2',
    });
    expect(sheet.passwordDraft()).toBe('hunter2');

    await sheet.onPasswordCommit();

    expect(patchRoomAccessMock).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it('reports nothing when the relay refuses, so the Lobby never shows a false lock', async () => {
    patchRoomAccessMock.mockRejectedValue(new Error('relay down'));
    const { sheet, harness, changes } = await mountSheet(FIB, []);
    sheet.passwordDraft.set('hunter2');

    await sheet.onPasswordCommit();

    expect(changes).toEqual([]);
    expect(harness.updateCredentials).not.toHaveBeenCalled();
    expect(harness.toastError).toHaveBeenCalledWith("Couldn't update the password. Try again.");
    expect(sheet.savingAccess()).toBe(false);
  });
});

describe('SessionSettingsSheetComponent — removing a password', () => {
  it('opens the room on the relay, drops the cached hash, and reports the change', async () => {
    const { sheet, harness, changes } = await mountSheet(FIB, [], {
      accessMode: 'password',
      accessPassword: 'hunter2',
    });

    await sheet.onRemovePassword();

    expect(patchRoomAccessMock).toHaveBeenCalledWith('http://relay.test', 'room-uuid-1', null);
    expect(harness.updateCredentials).toHaveBeenCalledWith(null);
    expect(harness.clearPasswordHash).toHaveBeenCalledWith('room-uuid-1');
    expect(changes).toEqual([{ mode: 'open', password: null }]);
    expect(sheet.passwordDraft()).toBe('');
    expect(harness.toastInfo).toHaveBeenCalledWith('Password removed');
  });

  it('offers the Remove button only while the session is protected', async () => {
    const open = await mountSheet(FIB, [], { accessMode: 'open' });
    expect(open.fixture.nativeElement.querySelector('.remove-password-btn')).toBeNull();

    const locked = await mountSheet(FIB, [], { accessMode: 'password' });
    expect(locked.fixture.nativeElement.querySelector('.remove-password-btn')).not.toBeNull();
  });
});

describe('SessionSettingsSheetComponent — host gating', () => {
  it('a non-host cannot change the scale', async () => {
    const { sheet, harness } = await mountSheet(FIB, [], { isHost: false });

    sheet.onScaleSelected({ id: 't-shirt', cards: ['S', 'M'] });

    expect(harness.updateSettings).not.toHaveBeenCalled();
  });

  it('a non-host cannot set or remove the password', async () => {
    const { sheet, changes } = await mountSheet(FIB, [], {
      isHost: false,
      accessMode: 'password',
    });
    sheet.passwordDraft.set('hunter2');

    await sheet.onPasswordCommit();
    await sheet.onRemovePassword();

    expect(patchRoomAccessMock).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
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
