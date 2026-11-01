// Exercises: settings.helpers:isValidTheme, isValidAccent, relayUrlDisplayLabel
// Exercises: SettingsPage:scaleLabel (custom-scale label resolution)

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { UNBOUND_SESSION_COMMANDS, type CustomScale, type Scale } from '@hnch/shared';

import { ACCENTS } from '../core/accent.tokens';
import { isValidAccent, isValidTheme, relayUrlDisplayLabel } from './settings.helpers';

// isValidTheme

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

// isValidAccent

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

// relayUrlDisplayLabel

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

// SettingsPage.scaleLabel

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});
  return {
    IonBackButton: stub('ion-back-button'),
    IonButtons: stub('ion-buttons'),
    IonContent: stub('ion-content'),
    IonHeader: stub('ion-header'),
    IonIcon: stub('ion-icon'),
    IonInput: stub('ion-input'),
    IonItem: stub('ion-item'),
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    // Not used by the page itself — SurfaceService pulls in MenuPopoverComponent.
    IonListHeader: stub('ion-list-header'),
    IonModal: stub('ion-modal'),
    IonNote: stub('ion-note'),
    IonSelect: stub('ion-select'),
    IonSelectOption: stub('ion-select-option'),
    IonTitle: stub('ion-title'),
    IonToggle: stub('ion-toggle'),
    IonToolbar: stub('ion-toolbar'),
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({
  chevronBackOutline: 'chevron-back-outline',
  contrastOutline: 'contrast-outline',
  moonOutline: 'moon-outline',
  sunnyOutline: 'sunny-outline',
}));
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
  const { AvatarColorService } = await import('../core/avatar-color.service');
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
      {
        provide: AvatarColorService,
        useValue: {
          value: signal<string | null>(null).asReadonly(),
          setValue: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: DocService,
        useValue: { hasSession: signal(false), commands: UNBOUND_SESSION_COMMANDS },
      },
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

interface AvatarHarness {
  setValue: ReturnType<typeof vi.fn>;
  valueSig: ReturnType<typeof signal<string | null>>;
}

async function mountSettingsWithAvatar(initial: string | null = null): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent>;
  avatar: AvatarHarness;
  recolor: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  setDisplayName: ReturnType<typeof vi.fn>;
  hasSession: ReturnType<typeof signal<boolean>>;
}> {
  const { AccentService } = await import('../core/accent.service');
  const { AppPreferenceService } = await import('../core/app-preference.service');
  const { AvatarColorService } = await import('../core/avatar-color.service');
  const { DocService } = await import('../core/doc/doc.service');
  const { DisplayNameService } = await import('../core/display-name.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { ScalePreferenceService } = await import('../core/scale-preference.service');
  const { ThemeService } = await import('../core/theme.service');
  const { SurfaceService } = await import('../core/surface.service');

  const valueSig = signal<string | null>(initial);
  const recolorMock = vi.fn();
  const renameMock = vi.fn();
  const setDisplayNameMock = vi.fn().mockResolvedValue(undefined);
  const avatar: AvatarHarness = {
    setValue: vi.fn().mockImplementation(async (wire: string) => {
      valueSig.set(wire);
      return wire;
    }),
    valueSig,
  };
  const hasSessionSig = signal(false);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AccentService, useValue: { current: signal('blue').asReadonly(), set: vi.fn() } },
      { provide: AppPreferenceService, useValue: { relayHttpUrl: signal(null).asReadonly() } },
      {
        provide: AvatarColorService,
        useValue: { value: valueSig.asReadonly(), setValue: avatar.setValue },
      },
      {
        provide: DocService,
        useValue: {
          hasSession: hasSessionSig.asReadonly(),
          commands: { ...UNBOUND_SESSION_COMMANDS, recolor: recolorMock, rename: renameMock },
        },
      },
      {
        provide: DisplayNameService,
        useValue: {
          getDisplayName: vi.fn().mockResolvedValue('Host'),
          setDisplayName: setDisplayNameMock,
        },
      },
      { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
      {
        provide: ScalePreferenceService,
        useValue: {
          defaultScale: signal({ id: 'fibonacci', cards: ['1'] }).asReadonly(),
          defaultScaleId: signal('fibonacci').asReadonly(),
          customScales: signal<CustomScale[]>([]).asReadonly(),
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
  const fixture = TestBed.createComponent(SettingsPage);
  return {
    fixture,
    avatar,
    recolor: recolorMock,
    rename: renameMock,
    setDisplayName: setDisplayNameMock,
    hasSession: hasSessionSig,
  };
}

interface AvatarMethods {
  onAvatarSelectChanged: (v: string | null | undefined) => void;
  avatarSelectValue: () => string | null;
  avatarResolvedColor: () => string;
}

function avatarApi(fixture: { componentInstance: unknown }): AvatarMethods {
  return fixture.componentInstance as unknown as AvatarMethods;
}

describe('SettingsPage — avatar color picker (ADR-0043)', () => {
  it('selecting a palette key persists via AvatarColorService', async () => {
    const { fixture, avatar } = await mountSettingsWithAvatar(null);
    avatarApi(fixture).onAvatarSelectChanged('blue');
    await Promise.resolve();
    expect(avatar.setValue).toHaveBeenCalledWith('blue');
    expect(avatar.valueSig()).toBe('blue');
  });

  it('selecting "custom" seeds the current resolved color as a hex literal', async () => {
    const { fixture, avatar } = await mountSettingsWithAvatar('blue');
    avatarApi(fixture).onAvatarSelectChanged('custom');
    await Promise.resolve();
    expect(avatar.setValue).toHaveBeenCalledTimes(1);
    const seed = avatar.setValue.mock.calls[0]![0] as string;
    expect(seed).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('selecting "custom" when already custom is a no-op', async () => {
    const { fixture, avatar } = await mountSettingsWithAvatar('#abcdef');
    avatarApi(fixture).onAvatarSelectChanged('custom');
    await Promise.resolve();
    expect(avatar.setValue).not.toHaveBeenCalled();
  });

  it('selecting the current value is a no-op (no extra setValue)', async () => {
    const { fixture, avatar } = await mountSettingsWithAvatar('teal');
    avatarApi(fixture).onAvatarSelectChanged('teal');
    await Promise.resolve();
    expect(avatar.setValue).not.toHaveBeenCalled();
  });

  it('avatarSelectValue maps a #rrggbb wire value onto "custom"', async () => {
    const { fixture } = await mountSettingsWithAvatar('#123456');
    expect(avatarApi(fixture).avatarSelectValue()).toBe('custom');
  });

  it('publishes into the doc when a session is active', async () => {
    const { fixture, avatar, recolor, hasSession } = await mountSettingsWithAvatar('blue');
    hasSession.set(true);
    avatarApi(fixture).onAvatarSelectChanged('red');
    // Allow the chained `then` inside persistAvatarColor to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(avatar.setValue).toHaveBeenCalledWith('red');
    expect(recolor).toHaveBeenCalledWith('red');
  });

  it('ignores invalid select values', async () => {
    const { fixture, avatar } = await mountSettingsWithAvatar(null);
    avatarApi(fixture).onAvatarSelectChanged('garbage');
    avatarApi(fixture).onAvatarSelectChanged(null);
    avatarApi(fixture).onAvatarSelectChanged(undefined);
    expect(avatar.setValue).not.toHaveBeenCalled();
  });
});

describe('SettingsPage — themeIconName (#251)', () => {
  async function mountWithTheme(theme: 'system' | 'light' | 'dark') {
    const { AccentService } = await import('../core/accent.service');
    const { AppPreferenceService } = await import('../core/app-preference.service');
    const { AvatarColorService } = await import('../core/avatar-color.service');
    const { DocService } = await import('../core/doc/doc.service');
    const { DisplayNameService } = await import('../core/display-name.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { ThemeService } = await import('../core/theme.service');
    const { SurfaceService } = await import('../core/surface.service');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AccentService,
          useValue: { accent: signal('blue').asReadonly(), setAccent: vi.fn() },
        },
        { provide: AppPreferenceService, useValue: { relayHttpUrl: signal(null).asReadonly() } },
        {
          provide: AvatarColorService,
          useValue: {
            value: signal<string | null>(null).asReadonly(),
            setValue: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DocService,
          useValue: { hasSession: signal(false), commands: UNBOUND_SESSION_COMMANDS },
        },
        {
          provide: DisplayNameService,
          useValue: {
            getDisplayName: vi.fn().mockResolvedValue('Host'),
            setDisplayName: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        {
          provide: ScalePreferenceService,
          useValue: {
            defaultScale: signal({ id: 'fibonacci', cards: ['1'] }).asReadonly(),
            defaultScaleId: signal('fibonacci').asReadonly(),
            customScales: signal<CustomScale[]>([]).asReadonly(),
          },
        },
        { provide: ThemeService, useValue: { theme: signal(theme).asReadonly() } },
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

  it('returns sunny-outline for light theme', async () => {
    const fixture = await mountWithTheme('light');
    const cmp = fixture.componentInstance as unknown as { themeIconName: () => string };
    expect(cmp.themeIconName()).toBe('sunny-outline');
  });

  it('returns moon-outline for dark theme', async () => {
    const fixture = await mountWithTheme('dark');
    const cmp = fixture.componentInstance as unknown as { themeIconName: () => string };
    expect(cmp.themeIconName()).toBe('moon-outline');
  });

  it('returns contrast-outline for system theme', async () => {
    const fixture = await mountWithTheme('system');
    const cmp = fixture.componentInstance as unknown as { themeIconName: () => string };
    expect(cmp.themeIconName()).toBe('contrast-outline');
  });
});

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

// Display-name save — `commands.rename` with no session guard (#507, #516)
//
// The unbound adapter refuses honestly when no session is live, so the page
// calls the command unconditionally rather than branching on `hasSession()`.

interface DisplayNameMethods {
  displayName: ReturnType<typeof signal<string>>;
  onNameSaved(name: string): void;
}

function displayNameApi(fixture: { componentInstance: unknown }): DisplayNameMethods {
  return fixture.componentInstance as unknown as DisplayNameMethods;
}

describe('SettingsPage — display name save', () => {
  it('persists locally and publishes the rename into the doc', async () => {
    const { fixture, rename, setDisplayName } = await mountSettingsWithAvatar();
    const page = displayNameApi(fixture);

    page.onNameSaved('Ada');

    expect(page.displayName()).toBe('Ada');
    expect(setDisplayName).toHaveBeenCalledWith('Ada');
    expect(rename).toHaveBeenCalledWith('Ada');
  });

  it('still calls the command with no session — the unbound adapter refuses', async () => {
    const { fixture, hasSession } = await mountSettingsWithAvatar();
    hasSession.set(false);
    const page = displayNameApi(fixture);

    // `UNBOUND_SESSION_COMMANDS.rename` is what answers here in a real
    // sessionless page; the point is that the call site has no guard to skip.
    expect(() => page.onNameSaved('Ada')).not.toThrow();
  });
});

describe('SettingsPage — About (AGPL-3.0 section 13 source offer)', () => {
  async function mountRendered() {
    const { AccentService } = await import('../core/accent.service');
    const { AppPreferenceService } = await import('../core/app-preference.service');
    const { AvatarColorService } = await import('../core/avatar-color.service');
    const { DocService } = await import('../core/doc/doc.service');
    const { DisplayNameService } = await import('../core/display-name.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { ThemeService } = await import('../core/theme.service');
    const { SurfaceService } = await import('../core/surface.service');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AccentService,
          useValue: { accent: signal('blue').asReadonly(), setAccent: vi.fn() },
        },
        {
          provide: AppPreferenceService,
          useValue: {
            relayHttpUrl: signal(undefined).asReadonly(),
            defaultSessionName: signal(undefined).asReadonly(),
            defaultPassword: signal(false).asReadonly(),
          },
        },
        {
          provide: AvatarColorService,
          useValue: { value: signal<string | null>(null).asReadonly(), setValue: vi.fn() },
        },
        {
          provide: DocService,
          useValue: { hasSession: signal(false), commands: UNBOUND_SESSION_COMMANDS },
        },
        {
          provide: DisplayNameService,
          useValue: {
            getDisplayName: vi.fn().mockResolvedValue('Host'),
            setDisplayName: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        {
          provide: ScalePreferenceService,
          useValue: {
            defaultScale: signal({ id: 'fibonacci', cards: ['1'] }).asReadonly(),
            defaultScaleId: signal('fibonacci').asReadonly(),
            customScales: signal<CustomScale[]>([]).asReadonly(),
          },
        },
        { provide: ThemeService, useValue: { theme: signal('system').asReadonly() } },
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
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function item(page: HTMLElement, text: string): Element | undefined {
    return [...page.querySelectorAll('ion-item')].find((el) => el.textContent?.includes(text));
  }

  it('links to the source code in a new tab', async () => {
    const link = item(await mountRendered(), 'Source code');

    expect(link?.getAttribute('href')).toBe('https://github.com/IIxauII/hnch');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('names the license', async () => {
    const row = item(await mountRendered(), 'License');

    expect(row?.textContent).toContain('AGPL-3.0-only');
  });
});
