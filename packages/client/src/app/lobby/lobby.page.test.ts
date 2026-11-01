/**
 * Unit tests for the Lobby: the pure helpers behind its copy, the computeds
 * that feed the template, the host / joiner split of the template itself, and
 * the command call sites.
 */

import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { UNBOUND_SESSION_COMMANDS } from '@hnch/shared';
import type {
  AgendaItem,
  AgendaResult,
  CustomScale,
  ParticipantSnapshot,
  RosterResult,
  Round,
  RoundResult,
  Scale,
  Screen,
  SessionCommands,
} from '@hnch/shared';

import { SessionExitService } from '../core/session-exit.service';
import {
  buildCopyRoomCodeToast,
  buildResultsHeading,
  buildRoundCta,
  buildSessionSummary,
  buildWaitingNote,
  isParticipantViewer,
} from './lobby-helpers';

function makeParticipant(id: string, role?: 'voter' | 'viewer'): ParticipantSnapshot {
  return { id, displayName: id, joinedAt: 0, role };
}

describe('LobbyPage — isParticipantViewer', () => {
  it('false when role field is omitted (default voter)', () => {
    expect(isParticipantViewer(makeParticipant('me'))).toBe(false);
  });

  it('false when role is explicitly voter', () => {
    expect(isParticipantViewer(makeParticipant('me', 'voter'))).toBe(false);
  });

  it('true when role is viewer', () => {
    expect(isParticipantViewer(makeParticipant('me', 'viewer'))).toBe(true);
  });
});

// Exercises: lobby/lobby-helpers:buildCopyRoomCodeToast
describe('LobbyPage — buildCopyRoomCodeToast', () => {
  it('success path returns fixed copied message', () => {
    expect(buildCopyRoomCodeToast(true, 'K7P-9MR')).toBe('Code copied');
  });

  it('failure path surfaces the dash-formatted code so the user can read it', () => {
    expect(buildCopyRoomCodeToast(false, 'K7P-9MR')).toBe("Couldn't copy. The code is K7P-9MR");
  });

  it('failure path preserves whatever code string is passed (no reformatting)', () => {
    expect(buildCopyRoomCodeToast(false, 'ABC-XYZ')).toBe("Couldn't copy. The code is ABC-XYZ");
  });
});

// buildResultsHeading — the round's number in the session, nothing else.
// The re-vote breadcrumb (#111) is `revoteLabel`, tested next to it.

function makeRound(overrides: Partial<Round> & { id: string }): Round {
  return {
    scale: { id: 'fibonacci', cards: ['1', '2'] },
    votes: {},
    createdAt: 0,
    createdBy: 'p1',
    status: 'voting',
    ...overrides,
  };
}

describe('LobbyPage — buildResultsHeading', () => {
  it('empty string when no round has ended', () => {
    expect(buildResultsHeading(null)).toBe('');
  });

  it('"Round N results" for the round that goes by N', () => {
    expect(buildResultsHeading(1)).toBe('Round 1 results');
    expect(buildResultsHeading(12)).toBe('Round 12 results');
  });
});

// Exercises: lobby/lobby-helpers:buildSessionSummary
describe('LobbyPage — buildSessionSummary', () => {
  it('is the scale alone for an open, unnamed session', () => {
    expect(buildSessionSummary({ scaleLabel: 'Fibonacci', passwordProtected: false })).toBe(
      'Fibonacci',
    );
  });

  it('says so when the session is locked', () => {
    expect(buildSessionSummary({ scaleLabel: 'Fibonacci', passwordProtected: true })).toBe(
      'Fibonacci · Password protected',
    );
  });

  it('is empty when there is nothing to say', () => {
    expect(buildSessionSummary({ scaleLabel: '', passwordProtected: false })).toBe('');
  });
});

// Exercises: lobby/lobby-helpers:buildRoundCta
describe('LobbyPage — buildRoundCta', () => {
  it('"Start round 1" before any round has finished', () => {
    expect(buildRoundCta(false, 1)).toBe('Start round 1');
  });

  it('"Next round N" once there is a result on screen', () => {
    expect(buildRoundCta(true, 4)).toBe('Next round 4');
  });

  it('says "Start" for any number while there is no result to follow', () => {
    expect(buildRoundCta(false, 2)).toBe('Start round 2');
  });
});

// Exercises: lobby/lobby-helpers:buildWaitingNote
describe('LobbyPage — buildWaitingNote', () => {
  it('names the host and the first round', () => {
    expect(buildWaitingNote('Ada', false)).toBe('Waiting for Ada to start the first round.');
  });

  it('switches to the next round once one has finished', () => {
    expect(buildWaitingNote('Ada', true)).toBe('Waiting for Ada to start the next round.');
  });

  it('falls back to "the host" when the host is unknown or unnamed', () => {
    expect(buildWaitingNote(null, false)).toBe('Waiting for the host to start the first round.');
    expect(buildWaitingNote('  ', true)).toBe('Waiting for the host to start the next round.');
  });
});

// LobbyPage.subtitle — exercises getScaleLabel(id, customScales()) at line 649

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Injectable } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});

  @Injectable()
  class AlertController {
    create = vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() });
  }

  @Injectable()
  class PopoverController {
    create = vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() });
    dismiss = vi.fn().mockResolvedValue(true);
  }

  return {
    AlertController,
    PopoverController,
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonContent: stub('ion-content'),
    IonFooter: stub('ion-footer'),
    IonHeader: stub('ion-header'),
    IonIcon: stub('ion-icon'),
    IonInput: stub('ion-input'),
    IonItem: stub('ion-item'),
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonModal: Comp({ selector: 'ion-modal', template: '<ng-content/>', standalone: true })(
      class {
        present(): Promise<void> {
          return Promise.resolve();
        }
        dismiss(): Promise<boolean> {
          return Promise.resolve(true);
        }
      },
    ),
    IonNote: stub('ion-note'),
    IonTextarea: stub('ion-textarea'),
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({
  chevronBackOutline: '',
  closeCircleOutline: '',
  copyOutline: '',
  ellipsisHorizontal: '',
  lockClosedOutline: '',
  logOutOutline: '',
  pencilOutline: '',
  personRemoveOutline: '',
  qrCodeOutline: '',
  settingsOutline: '',
  shareOutline: '',
  starOutline: '',
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(), canShare: vi.fn() } }));

const stubStandalone = async (selector: string, name: string) => {
  const { Component } = await import('@angular/core');
  @Component({ selector, template: '', standalone: true })
  class S {}
  return { [name]: S };
};
vi.mock('../shared/connection-status-banner.component', () =>
  stubStandalone('app-connection-status-banner', 'ConnectionStatusBannerComponent'),
);
vi.mock('../round-start/round-start.sheet', () =>
  stubStandalone('app-round-start-sheet', 'RoundStartSheetComponent'),
);
vi.mock('./round-edit.sheet', () =>
  stubStandalone('app-round-edit-sheet', 'RoundEditSheetComponent'),
);
vi.mock('../session-settings/session-settings.sheet', () =>
  stubStandalone('app-session-settings-sheet', 'SessionSettingsSheetComponent'),
);
vi.mock('../shared/avatar.component', () => stubStandalone('app-avatar', 'AvatarComponent'));
vi.mock('../shared/role-toggle.component', () =>
  stubStandalone('app-role-toggle', 'RoleToggleComponent'),
);
vi.mock('../shared/round-history.component', () =>
  stubStandalone('app-round-history', 'RoundHistoryComponent'),
);
vi.mock('../shared/vote-results.component', () =>
  stubStandalone('app-vote-results', 'VoteResultsComponent'),
);
vi.mock('./qr-display.sheet', () =>
  stubStandalone('app-qr-display-sheet', 'QrDisplaySheetComponent'),
);
vi.mock('../agenda/agenda-panel.component', () =>
  stubStandalone('app-agenda-panel', 'AgendaPanelComponent'),
);
vi.mock('../agenda/agenda-item-form.sheet', () =>
  stubStandalone('app-agenda-item-form-sheet', 'AgendaItemFormSheetComponent'),
);

async function mountLobby(scale: Scale | undefined, customs: CustomScale[]) {
  const { Router } = await import('@angular/router');
  const { DocService } = await import('../core/doc/doc.service');
  const { HapticService } = await import('../core/haptic.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { LastSessionService } = await import('../core/last-session.service');
  const { ScalePreferenceService } = await import('../core/scale-preference.service');
  const { SurfaceService } = await import('../core/surface.service');
  const { ToastService } = await import('../services/toast.service');
  const { ExportService } = await import('../core/export.service');
  const { SessionAccessService } = await import('../core/session-access.service');
  const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      {
        provide: DocService,
        useValue: {
          settings: signal(scale ? { defaultScale: scale } : undefined).asReadonly(),
          roomCode: signal('ABC123').asReadonly(),
          meta: signal(undefined).asReadonly(),
          syncStatus: signal('disconnected').asReadonly(),
          relaySynced: signal(false).asReadonly(),
          joined: signal(false).asReadonly(),
          relayRoomUuid: signal(null).asReadonly(),
          currentRound: signal(undefined).asReadonly(),
          screen: signal('lobby').asReadonly(),
          lastRejection: signal(null).asReadonly(),
          rounds: signal([]).asReadonly(),
          participants: signal([]).asReadonly(),
          activeParticipants: signal([]).asReadonly(),
          onlineParticipantIds: signal(new Set()).asReadonly(),
          agenda: signal([]).asReadonly(),
          pendingAgenda: signal([]).asReadonly(),
          nextPendingAgendaItem: signal(null).asReadonly(),
          commands: UNBOUND_SESSION_COMMANDS,
          teardown: vi.fn(),
        },
      },
      { provide: HapticService, useValue: { impactLight: vi.fn() } },
      { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
      { provide: LastSessionService, useValue: { record: vi.fn() } },
      { provide: SessionExitService, useValue: { exit: vi.fn() } },
      {
        provide: ScalePreferenceService,
        useValue: { customScales: signal(customs).asReadonly() },
      },
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
      { provide: ToastService, useValue: { show: vi.fn(), error: vi.fn() } },
      { provide: ExportService, useValue: { export: vi.fn() } },
      {
        provide: SessionAccessService,
        useValue: {
          mode: signal('open').asReadonly(),
          saving: signal(false).asReadonly(),
          refresh: () => Promise.resolve(),
        },
      },
      {
        provide: AlertController,
        useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
      },
      {
        provide: PopoverController,
        useValue: {
          create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
          dismiss: vi.fn().mockResolvedValue(true),
        },
      },
    ],
  });

  const { LobbyPage } = await import('./lobby.page');
  // Skip detectChanges — the template touches many computeds we don't need
  // for this assertion. Component-instance access reaches the subtitle
  // computed directly.
  return TestBed.createComponent(LobbyPage);
}

describe('LobbyPage — onRoundStart forwards ticketId', () => {
  async function mountWithStartRoundSpy() {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    const startRound = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal('ABC123').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: signal('lobby').asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            commands: { ...UNBOUND_SESSION_COMMANDS, startRound },
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight: vi.fn() } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
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
        { provide: ToastService, useValue: { show: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });
    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);
    return { fixture, startRound };
  }

  type Internals = {
    onRoundStart(s: {
      title: string | null;
      ticketId: string | null;
      description?: string | null;
      agendaItemId?: string;
    }): Promise<void>;
  };

  it('writes ticketId when submission has one', async () => {
    const { fixture, startRound } = await mountWithStartRoundSpy();
    const internals = fixture.componentInstance as unknown as Internals;
    await internals
      .onRoundStart({ title: 'Auth', ticketId: 'PROJ-42', description: null })
      .catch(() => undefined);
    expect(startRound).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Auth', ticketId: 'PROJ-42' }),
    );
  });

  it('omits ticketId when submission.ticketId is null', async () => {
    const { fixture, startRound } = await mountWithStartRoundSpy();
    const internals = fixture.componentInstance as unknown as Internals;
    await internals
      .onRoundStart({ title: 'Auth', ticketId: null, description: null })
      .catch(() => undefined);
    expect(startRound).toHaveBeenCalledWith(expect.objectContaining({ title: 'Auth' }));
    expect(startRound).not.toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: expect.anything() }),
    );
  });

  it('omits both fields when both are null', async () => {
    const { fixture, startRound } = await mountWithStartRoundSpy();
    const internals = fixture.componentInstance as unknown as Internals;
    await internals
      .onRoundStart({ title: null, ticketId: null, description: null })
      .catch(() => undefined);
    expect(startRound).toHaveBeenCalledWith(
      expect.not.objectContaining({ title: expect.anything() }),
    );
  });
});

describe('LobbyPage — subtitle (custom scale label)', () => {
  it('shows the custom label when defaultScale is a known custom scale', async () => {
    const fixture = await mountLobby({ id: 'custom-bananas', cards: ['1', '2'] }, [
      { id: 'custom-bananas', label: 'Team Bananas', cards: ['1', '2'] },
    ]);
    const subtitle = (
      fixture.componentInstance as unknown as { subtitle: () => string }
    ).subtitle();
    expect(subtitle).toContain('Team Bananas');
    expect(subtitle).not.toContain('custom-bananas');
  });

  it('falls back to formatted id when the custom label is blank', async () => {
    const fixture = await mountLobby({ id: 'custom-no-label', cards: ['1'] }, [
      { id: 'custom-no-label', label: '', cards: ['1'] },
    ]);
    const subtitle = (
      fixture.componentInstance as unknown as { subtitle: () => string }
    ).subtitle();
    expect(subtitle).toContain('No Label');
  });

  it('shows the builtin display name for a builtin scale', async () => {
    const fixture = await mountLobby({ id: 'fibonacci', cards: ['0', '1'] }, []);
    const subtitle = (
      fixture.componentInstance as unknown as { subtitle: () => string }
    ).subtitle();
    expect(subtitle).toContain('Fibonacci');
  });
});

// LobbyPage subtitle affordance — host vs viewer rendering

async function mountLobbySubtitleAffordance(opts: { isHost: boolean; subtitle: string }) {
  const { Router } = await import('@angular/router');
  const { DocService } = await import('../core/doc/doc.service');
  const { HapticService } = await import('../core/haptic.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { LastSessionService } = await import('../core/last-session.service');
  const { ScalePreferenceService } = await import('../core/scale-preference.service');
  const { SurfaceService } = await import('../core/surface.service');
  const { ToastService } = await import('../services/toast.service');
  const { ExportService } = await import('../core/export.service');
  const { SessionAccessService } = await import('../core/session-access.service');
  const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

  // isHost = (myId === hostParticipantId). myId = 'me' (from ParticipantIdService stub).
  const hostParticipantId = opts.isHost ? 'me' : 'other';
  // subtitle is driven by defaultScale; supply a fibonacci-id scale so subtitle() = 'Fibonacci …'
  // but we only need non-empty; use a builtin scale whose label contains text.
  // Use a custom scale so we can set the exact label text.
  const customScaleId = 'custom-test';
  const scale = opts.subtitle ? { id: customScaleId, cards: ['1'] } : undefined;
  const customs = opts.subtitle ? [{ id: customScaleId, label: opts.subtitle, cards: ['1'] }] : [];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      {
        provide: DocService,
        useValue: {
          settings: signal(
            scale ? { defaultScale: scale, hostParticipantId } : { hostParticipantId },
          ).asReadonly(),
          roomCode: signal('ABC123').asReadonly(),
          meta: signal(undefined).asReadonly(),
          syncStatus: signal('disconnected').asReadonly(),
          relaySynced: signal(false).asReadonly(),
          joined: signal(false).asReadonly(),
          relayRoomUuid: signal(null).asReadonly(),
          currentRound: signal(undefined).asReadonly(),
          screen: signal('lobby').asReadonly(),
          lastRejection: signal(null).asReadonly(),
          rounds: signal([]).asReadonly(),
          participants: signal([]).asReadonly(),
          activeParticipants: signal([]).asReadonly(),
          onlineParticipantIds: signal(new Set()).asReadonly(),
          agenda: signal([]).asReadonly(),
          pendingAgenda: signal([]).asReadonly(),
          nextPendingAgendaItem: signal(null).asReadonly(),
          commands: UNBOUND_SESSION_COMMANDS,
          teardown: vi.fn(),
          hasSession: signal(false).asReadonly(),
        },
      },
      { provide: HapticService, useValue: { impactLight: vi.fn() } },
      { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
      { provide: LastSessionService, useValue: { record: vi.fn() } },
      { provide: SessionExitService, useValue: { exit: vi.fn() } },
      {
        provide: ScalePreferenceService,
        useValue: { customScales: signal(customs).asReadonly() },
      },
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
      { provide: ToastService, useValue: { show: vi.fn(), info: vi.fn(), error: vi.fn() } },
      { provide: ExportService, useValue: { export: vi.fn() } },
      {
        provide: SessionAccessService,
        useValue: {
          mode: signal('open').asReadonly(),
          saving: signal(false).asReadonly(),
          refresh: () => Promise.resolve(),
        },
      },
      {
        provide: AlertController,
        useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
      },
      {
        provide: PopoverController,
        useValue: {
          create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
          dismiss: vi.fn().mockResolvedValue(true),
        },
      },
    ],
  });

  const { LobbyPage } = await import('./lobby.page');
  const fixture = TestBed.createComponent(LobbyPage);
  fixture.detectChanges();
  return fixture;
}

describe('LobbyPage — subtitle affordance', () => {
  it('host with non-empty subtitle renders button.subtitle with pencil icon and aria-label', async () => {
    const fixture = await mountLobbySubtitleAffordance({ isHost: true, subtitle: 'My Scale' });
    const el: HTMLElement = fixture.nativeElement;
    const btn = el.querySelector('button.subtitle');
    expect(btn).not.toBeNull();
    const icon = btn!.querySelector('ion-icon[name="pencil-outline"]');
    expect(icon).not.toBeNull();
    expect(btn!.getAttribute('aria-label')).toContain('Edit session settings:');
    expect(btn!.getAttribute('aria-label')).toContain('My Scale');
  });

  it('non-host with non-empty subtitle renders plain text, nothing to press', async () => {
    const fixture = await mountLobbySubtitleAffordance({ isHost: false, subtitle: 'My Scale' });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('button.subtitle')).toBeNull();
    const text = el.querySelector('p.subtitle-chip');
    expect(text?.textContent?.trim()).toBe('My Scale');
    expect(text?.querySelector('ion-icon[name="pencil-outline"]')).toBeNull();
  });

  it('empty subtitle renders neither the button nor the text', async () => {
    const fixture = await mountLobbySubtitleAffordance({ isHost: true, subtitle: '' });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('button.subtitle')).toBeNull();
    expect(el.querySelector('.subtitle-chip')).toBeNull();
  });
});

// LobbyPage.onCopyRoomCode — tap-to-copy handler (#116)

// Exercises: lobby/lobby.page:LobbyPage (onCopyRoomCode via TestBed)
describe('LobbyPage — onCopyRoomCode', () => {
  type Internals = { onCopyRoomCode(): Promise<void> };

  async function mountWithToast(opts: { roomCode?: string; writeText?: ReturnType<typeof vi.fn> }) {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    const info = vi.fn().mockResolvedValue(undefined);
    const writeText = opts.writeText ?? vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal(opts.roomCode ?? 'ABC123').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: signal('lobby').asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            commands: UNBOUND_SESSION_COMMANDS,
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight: vi.fn() } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
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
        { provide: ToastService, useValue: { info, error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });
    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);
    return { fixture, info, writeText };
  }

  it('success path: writes dash-formatted code to clipboard and surfaces copied toast', async () => {
    const { fixture, info, writeText } = await mountWithToast({ roomCode: 'ABC123' });
    const internals = fixture.componentInstance as unknown as Internals;
    await internals.onCopyRoomCode();
    expect(writeText).toHaveBeenCalledWith('ABC-123');
    expect(info).toHaveBeenCalledWith('Code copied');
  });

  it('failure path: clipboard rejection still fires fallback toast with code inline', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const { fixture, info } = await mountWithToast({ roomCode: 'XYZ789', writeText });
    const internals = fixture.componentInstance as unknown as Internals;
    await internals.onCopyRoomCode();
    expect(writeText).toHaveBeenCalledWith('XYZ-789');
    expect(info).toHaveBeenCalledWith("Couldn't copy. The code is XYZ-789");
  });

  it('empty room code: early-returns without touching clipboard or toast', async () => {
    const { fixture, info, writeText } = await mountWithToast({ roomCode: '' });
    const internals = fixture.componentInstance as unknown as Internals;
    await internals.onCopyRoomCode();
    expect(writeText).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});

// LobbyPage.openParticipantActions — the ⋯ button on a roster row. One
// affordance on every surface: `SurfaceService` turns the items into an
// action sheet on touch and a popover with a pointer.

describe('LobbyPage — openParticipantActions', () => {
  type Internals = {
    openParticipantActions(p: { id: string; displayName: string }, event: Event): Promise<void>;
    onHandoffTap(id: string, name: string): Promise<void>;
    onRemoveTap(id: string, name: string): Promise<void>;
  };

  /** `online`: who is here. The role can only be handed to one of them. */
  async function mountWithSurface(online: string[] = ['p1', 'p2', 'p3']) {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    const openSheetOrPopover = vi.fn().mockResolvedValue(undefined);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal('ABC123').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: signal('lobby').asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set(online)).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            commands: UNBOUND_SESSION_COMMANDS,
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight: vi.fn() } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
        {
          provide: SurfaceService,
          useValue: {
            mode: signal('desktop').asReadonly(),
            openSheetOrPopover,
            dismissMenu: vi.fn().mockResolvedValue(undefined),
            sheetBreakpoints: () => [0, 0.5, 1],
            initialSheetBreakpoint: () => 0.5,
            sheetBreakpointsFull: () => [0, 0.6, 1],
            initialSheetBreakpointFull: () => 1,
          },
        },
        { provide: ToastService, useValue: { show: vi.fn(), info: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });
    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);
    return { fixture, openSheetOrPopover };
  }

  it('offers Make host, Remove (destructive) and Cancel, titled with the name', async () => {
    const { fixture, openSheetOrPopover } = await mountWithSurface();
    const internals = fixture.componentInstance as unknown as Internals;
    const fakeEvent = new Event('click');
    const p = { id: 'p1', displayName: 'Alice' };

    await internals.openParticipantActions(p, fakeEvent);

    expect(openSheetOrPopover).toHaveBeenCalledTimes(1);
    const [opts] = openSheetOrPopover.mock.calls[0] as [
      { header?: string; items: { text: string; role?: string }[]; triggerEvent: Event },
    ];
    expect(opts.header).toBe('Alice');
    expect(opts.items.map((item) => item.text)).toEqual(['Make host', 'Remove', 'Cancel']);
    expect(opts.items[0]!.role).toBeUndefined();
    expect(opts.items[1]!.role).toBe('destructive');
    expect(opts.items[2]!.role).toBe('cancel');
    expect(opts.triggerEvent).toBe(fakeEvent);
  });

  it('Make-host item handler calls onHandoffTap with participant id and displayName', async () => {
    const { fixture, openSheetOrPopover } = await mountWithSurface();
    const internals = fixture.componentInstance as unknown as Internals;
    const onHandoffTap = vi.spyOn(internals, 'onHandoffTap').mockResolvedValue(undefined);

    const fakeEvent = new Event('click');
    const p = { id: 'p2', displayName: 'Bob' };
    await internals.openParticipantActions(p, fakeEvent);

    const [opts] = openSheetOrPopover.mock.calls[0] as [{ items: { handler?: () => void }[] }];
    opts.items[0]!.handler?.();
    expect(onHandoffTap).toHaveBeenCalledWith('p2', 'Bob');
  });

  it('Remove item handler calls onRemoveTap with participant id and displayName', async () => {
    const { fixture, openSheetOrPopover } = await mountWithSurface();
    const internals = fixture.componentInstance as unknown as Internals;
    const onRemoveTap = vi.spyOn(internals, 'onRemoveTap').mockResolvedValue(undefined);

    const fakeEvent = new Event('click');
    const p = { id: 'p3', displayName: 'Carol' };
    await internals.openParticipantActions(p, fakeEvent);

    const [opts] = openSheetOrPopover.mock.calls[0] as [{ items: { handler?: () => void }[] }];
    opts.items[1]!.handler?.();
    expect(onRemoveTap).toHaveBeenCalledWith('p3', 'Carol');
  });

  // The shared command refuses an offline target, so the offer ended in a
  // confirmation that did nothing.
  it('does not offer Make host for someone who is offline', async () => {
    const { fixture, openSheetOrPopover } = await mountWithSurface(['p2']);
    const internals = fixture.componentInstance as unknown as Internals;

    await internals.openParticipantActions({ id: 'p1', displayName: 'Alice' }, new Event('click'));

    const [opts] = openSheetOrPopover.mock.calls[0] as [{ items: { text: string }[] }];
    expect(opts.items.map((item) => item.text)).toEqual(['Remove', 'Cancel']);
  });
});

// LobbyPage.ngOnDestroy — dismisses popover and swallows rejections

describe('LobbyPage — ngOnDestroy', () => {
  async function mountForDestroy(dismissImpl: () => Promise<unknown>) {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    const dismiss = vi.fn().mockImplementation(dismissImpl);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal('ABC123').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: signal('lobby').asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            commands: UNBOUND_SESSION_COMMANDS,
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight: vi.fn() } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
        {
          provide: SurfaceService,
          useValue: {
            mode: signal('desktop').asReadonly(),
            openSheetOrPopover: vi.fn().mockResolvedValue(undefined),
            dismissMenu: vi.fn().mockResolvedValue(undefined),
            sheetBreakpoints: () => [0, 0.5, 1],
            initialSheetBreakpoint: () => 0.5,
            sheetBreakpointsFull: () => [0, 0.6, 1],
            initialSheetBreakpointFull: () => 1,
          },
        },
        { provide: ToastService, useValue: { show: vi.fn(), info: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss,
          },
        },
      ],
    });
    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);
    return { fixture, dismiss };
  }

  it('calls popoverCtrl.dismiss() on destroy', async () => {
    const { fixture, dismiss } = await mountForDestroy(() => Promise.resolve(true));
    fixture.componentInstance.ngOnDestroy();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('swallows rejection from popoverCtrl.dismiss() — no unhandled rejection', async () => {
    const { fixture, dismiss } = await mountForDestroy(() =>
      Promise.reject(new Error('no overlay')),
    );
    // Must not throw synchronously or leave an unhandled promise rejection.
    expect(() => fixture.componentInstance.ngOnDestroy()).not.toThrow();
    // Allow microtask queue to flush; no assertion needed — test fails if
    // Vitest catches an unhandled rejection.
    await Promise.resolve();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

// LobbyPage.closeRoundStart — Cancel button dismisses modal (regression for
// a presentSheet vs [isOpen] mismatch)

describe('LobbyPage — closeRoundStart calls modal.dismiss()', () => {
  type Internals = {
    roundStartOpen: { set(v: boolean): void; (): boolean };
    closeRoundStart(): Promise<void>;
  };

  async function mountWithModalSpy() {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal('ABC123').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: signal('lobby').asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            onlineIds: signal(new Set()).asReadonly(),
            commands: UNBOUND_SESSION_COMMANDS,
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight: vi.fn() } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
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
        { provide: ToastService, useValue: { info: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });

    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);

    // Inject a spy for the modal's dismiss method into the viewChild slot.
    const dismiss = vi.fn().mockResolvedValue(undefined);
    // Access the private modalRef viewChild via the component instance.
    // We override it via Object.defineProperty so the test controls the ref.
    const comp = fixture.componentInstance as unknown as Record<string, unknown>;
    Object.defineProperty(comp, 'modalRef', {
      value: () => ({ dismiss }),
      configurable: true,
    });

    return { fixture, dismiss };
  }

  it('calls modal.dismiss() and resets roundStartOpen when Cancel is tapped', async () => {
    const { fixture, dismiss } = await mountWithModalSpy();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.roundStartOpen.set(true);
    await internals.closeRoundStart();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(internals.roundStartOpen()).toBe(false);
  });

  it('resets roundStartOpen even when modalRef is absent (no modal in DOM)', async () => {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal('ABC123').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: signal('lobby').asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            onlineIds: signal(new Set()).asReadonly(),
            commands: UNBOUND_SESSION_COMMANDS,
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight: vi.fn() } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
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
        { provide: ToastService, useValue: { info: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });

    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);

    // Override modalRef to return undefined (no modal in DOM).
    const comp = fixture.componentInstance as unknown as Record<string, unknown>;
    Object.defineProperty(comp, 'modalRef', {
      value: () => undefined,
      configurable: true,
    });

    const internals = fixture.componentInstance as unknown as Internals;
    internals.roundStartOpen.set(true);
    await internals.closeRoundStart();
    expect(internals.roundStartOpen()).toBe(false);
  });
});

// LobbyPage — terminal-round computeds (status-driven, #468)
// lastRevealedRound / lastRoundWasSkipped / pastRevealedRounds branch on the
// projection `status` now that the raw terminal timestamps are gone.

describe('LobbyPage — terminal-round computeds (status)', () => {
  type Computeds = {
    lastRevealedRound(): Round | null;
    lastRoundWasSkipped(): boolean;
    pastRevealedRounds(): readonly Round[];
  };

  async function mountWithRounds(rounds: Round[]) {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal('ABC123').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: signal('lobby').asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal(rounds).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            commands: UNBOUND_SESSION_COMMANDS,
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight: vi.fn() } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        { provide: ScalePreferenceService, useValue: { customScales: signal([]).asReadonly() } },
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
        { provide: ToastService, useValue: { show: vi.fn(), info: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });
    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);
    return fixture.componentInstance as unknown as Computeds;
  }

  it('lastRevealedRound returns the latest revealed/skipped round; pastRevealedRounds excludes it', async () => {
    const r1 = makeRound({ id: 'r1', status: 'revealed', terminalAt: 1000 });
    const r2 = makeRound({ id: 'r2', status: 'skipped', terminalAt: 2000 });
    const c = await mountWithRounds([r1, r2]);
    expect(c.lastRevealedRound()?.id).toBe('r2');
    expect(c.lastRoundWasSkipped()).toBe(true);
    expect(c.pastRevealedRounds().map((r) => r.id)).toEqual(['r1']);
  });

  it('lastRevealedRound skips discarded tombstones and an active (voting) round', async () => {
    const r1 = makeRound({ id: 'r1', status: 'revealed', terminalAt: 1000 });
    const r2 = makeRound({ id: 'r2', status: 'discarded', terminalAt: 2000 });
    const r3 = makeRound({ id: 'r3', status: 'voting' });
    const c = await mountWithRounds([r1, r2, r3]);
    // lastRevealedRound anchors on the latest revealed/skipped round, skipping
    // the discarded tombstone and the still-voting round.
    expect(c.lastRevealedRound()?.id).toBe('r1');
    expect(c.lastRoundWasSkipped()).toBe(false);
    // A discarded round is a tombstone (ADR-0046): it is not history, so it
    // must not make the History card appear with nothing in it.
    expect(c.pastRevealedRounds()).toEqual([]);
  });

  it('lastRevealedRound is null when no round has ended', async () => {
    const c = await mountWithRounds([makeRound({ id: 'r1', status: 'voting' })]);
    expect(c.lastRevealedRound()).toBeNull();
    expect(c.lastRoundWasSkipped()).toBe(false);
    expect(c.pastRevealedRounds()).toEqual([]);
  });
});

// LobbyPage autoNav effect: wiring only — the `DocService.screen` signal
// drives the navigation. The rule itself is the shared `screenFor` selector
// and is tested there against plain projections (#508). What is
// asserted here is the destination, the history behaviour (a push, not a
// replace — unlike Estimating's), and the pre-load `null` guard.

describe('LobbyPage — autoNav effect (wiring)', () => {
  async function mountWithScreen(screen: Screen | null) {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    const navigate = vi.fn().mockResolvedValue(true);
    const screenSig = signal<Screen | null>(screen);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal('LOBBY1').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: screenSig.asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            commands: UNBOUND_SESSION_COMMANDS,
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight: vi.fn() } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
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
        { provide: ToastService, useValue: { show: vi.fn(), info: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });
    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);
    // Do NOT call detectChanges — the effect fires synchronously at construction.
    return { fixture, navigate, screenSig };
  }

  it('navigates to /estimating, pushing a history entry, when the screen is estimating', async () => {
    const { navigate } = await mountWithScreen('estimating');
    TestBed.flushEffects();
    expect(navigate).toHaveBeenCalledWith(['/estimating', 'LOBBY1']);
  });

  it('navigates when the screen flips to estimating mid-session', async () => {
    const { navigate, screenSig } = await mountWithScreen('lobby');
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
    screenSig.set('estimating');
    TestBed.flushEffects();
    expect(navigate).toHaveBeenCalledWith(['/estimating', 'LOBBY1']);
  });

  it('does NOT navigate while the screen is lobby', async () => {
    const { navigate } = await mountWithScreen('lobby');
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
  });

  // The pre-load guard: a peer admitted by the session-resume guard's timeout
  // path mounts before the doc syncs. Reading that as "no active round" would
  // be harmless here, but the symmetric guard on Estimating is not — keep both
  // adapters honest about what `null` means.
  it('does NOT navigate while the screen is null (projection not yet loaded)', async () => {
    const { navigate } = await mountWithScreen(null);
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
  });
});

// Agenda form submit — the one deliberate UX consequence of moving the agenda writers into shared (#507).
//
// Wiring only: the gate that produces the refusal is pinned in
// `@hnch/shared`'s agenda-commands.test.ts. What matters here is client
// behaviour — an edit that refuses (a peer cancelled the item while this form
// was open) must leave the modal on screen rather than dismissing it and
// eating the user's typing.

describe('LobbyPage — agenda form refusal keeps the modal open', () => {
  async function mountWithAgendaResult(result: AgendaResult) {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
    const { SessionAccessService } = await import('../core/session-access.service');
    const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

    const updateAgendaItemFields = vi.fn().mockReturnValue(result);
    const appendAgendaItem = vi.fn().mockReturnValue(result);
    const impactLight = vi.fn();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: DocService,
          useValue: {
            settings: signal(undefined).asReadonly(),
            roomCode: signal('ABC123').asReadonly(),
            meta: signal(undefined).asReadonly(),
            syncStatus: signal('disconnected').asReadonly(),
            relaySynced: signal(false).asReadonly(),
            joined: signal(false).asReadonly(),
            relayRoomUuid: signal(null).asReadonly(),
            currentRound: signal(undefined).asReadonly(),
            screen: signal('lobby').asReadonly(),
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            commands: {
              ...UNBOUND_SESSION_COMMANDS,
              addItem: appendAgendaItem,
              editItem: updateAgendaItemFields,
            },
            teardown: vi.fn(),
          },
        },
        { provide: HapticService, useValue: { impactLight } },
        { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
        { provide: LastSessionService, useValue: { record: vi.fn() } },
        { provide: SessionExitService, useValue: { exit: vi.fn() } },
        { provide: ScalePreferenceService, useValue: { customScales: signal([]).asReadonly() } },
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
        { provide: ToastService, useValue: { show: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
        {
          provide: SessionAccessService,
          useValue: {
            mode: signal('open').asReadonly(),
            saving: signal(false).asReadonly(),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
        },
        {
          provide: PopoverController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
            dismiss: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });

    const { LobbyPage } = await import('./lobby.page');
    const fixture = TestBed.createComponent(LobbyPage);
    return { fixture, updateAgendaItemFields, appendAgendaItem, impactLight };
  }

  type Internals = {
    agendaFormMode: WritableSignal<'add' | 'edit'>;
    agendaFormOpen: WritableSignal<boolean>;
    editingAgendaItem: WritableSignal<AgendaItem | null>;
    onAgendaFormSubmit(s: {
      title: string | null;
      ticketId: string | null;
      description: string | null;
    }): void;
  };

  const ITEM: AgendaItem = {
    id: 'item-1',
    title: 'Login form',
    state: 'pending',
    source: 'manual',
    sortKey: 'a0',
    createdAt: 1,
  };

  function openEditForm(fixture: { componentInstance: unknown }): Internals {
    const internals = fixture.componentInstance as Internals;
    internals.agendaFormMode.set('edit');
    internals.editingAgendaItem.set(ITEM);
    internals.agendaFormOpen.set(true);
    return internals;
  }

  it('leaves the modal open and fires no haptic when the edit refuses', async () => {
    const { fixture, impactLight } = await mountWithAgendaResult({
      applied: false,
      reason: 'not-pending',
    });
    const internals = openEditForm(fixture);

    internals.onAgendaFormSubmit({ title: 'Signup form', ticketId: null, description: null });

    expect(internals.agendaFormOpen()).toBe(true);
    expect(internals.editingAgendaItem()).toEqual(ITEM);
    expect(impactLight).not.toHaveBeenCalled();
  });

  it('closes the modal when the edit applies', async () => {
    const { fixture, impactLight } = await mountWithAgendaResult({
      applied: true,
      id: 'item-1',
    });
    const internals = openEditForm(fixture);

    internals.onAgendaFormSubmit({ title: 'Signup form', ticketId: null, description: null });

    expect(internals.agendaFormOpen()).toBe(false);
    expect(internals.editingAgendaItem()).toBeNull();
    expect(impactLight).toHaveBeenCalled();
  });

  it('leaves the add form open when the add refuses', async () => {
    const { fixture } = await mountWithAgendaResult({
      applied: false,
      reason: 'invalid-fields',
    });
    const internals = fixture.componentInstance as Internals;
    internals.agendaFormMode.set('add');
    internals.agendaFormOpen.set(true);

    internals.onAgendaFormSubmit({ title: null, ticketId: null, description: null });

    expect(internals.agendaFormOpen()).toBe(true);
  });
});

// `docService.commands` call sites (#516)
//
// The refactor that moved the writer seam into `@hnch/shared` left these
// handlers as thin adapters: read the bound command's typed result, fire the
// haptic only when it applied, navigate only when it applied. That branch is
// the whole behaviour worth pinning here — the rules themselves are covered in
// `packages/shared`, so nothing below asserts on doc state.
//
// The two `startRound` refusal branches are why this section exists.
// `startRound` refuses (rather than throwing) when the room has no host to
// attribute the round to, and both Lobby call sites must stay put rather than
// navigate to an Estimating page with no round on it.

/** An `ion-alert` button as the page declares it. */
interface AlertButton {
  text: string;
  role?: string;
  handler?: () => void;
}

/** The Lobby members the command tests reach through, all `protected`. */
interface CommandInternals {
  onToggleRole(): void;
  onRoundStart(s: {
    title: string | null;
    ticketId: string | null;
    description: string | null;
    agendaItemId?: string;
  }): Promise<void>;
  onRevote(): Promise<void>;
  onAgendaSkip(id: string): void;
  onAgendaCancel(id: string): void;
  onAgendaReorderUp(id: string): void;
  onAgendaReorderDown(id: string): void;
  confirmEndSession(): Promise<void>;
  confirmLeave(): Promise<void>;
  onHandoffTap(participantId: string, displayName: string): Promise<void>;
  onRemoveTap(participantId: string, displayName: string): Promise<void>;
}

const APPLIED_ROSTER: RosterResult = { applied: true };
const REFUSED_ROSTER: RosterResult = { applied: false, reason: 'not-host' };
const APPLIED_AGENDA: AgendaResult = { applied: true, id: 'item-1' };
const REFUSED_AGENDA: AgendaResult = { applied: false, reason: 'not-pending' };
const APPLIED_ROUND: RoundResult = { applied: true, id: 'round-2', at: 1_000 };
const REFUSED_ROUND: RoundResult = { applied: false, reason: 'no-host' };

function makeRevealedRound(over: Partial<Round> = {}): Round {
  return { id: 'round-1', status: 'revealed', createdAt: 1, votes: {}, ...over } as Round;
}

function makePendingItem(id: string, sortKey: string): AgendaItem {
  return { id, title: id, state: 'pending', source: 'manual', sortKey, createdAt: 1 };
}

interface CommandMountOptions {
  /** Overrides folded over `UNBOUND_SESSION_COMMANDS`. */
  commands?: Partial<SessionCommands>;
  /** Result of `DocService.endSessionForEveryone` — not a bound command. */
  endSessionForEveryone?: RosterResult;
  /** Own participant id; `null` mounts a page with no identity yet. */
  myId?: string | null;
  pendingAgenda?: AgendaItem[];
  rounds?: Round[];
  /**
   * The UUID the relay issued for the session. The doc carries another one
   * (`meta().roomUuid`), to show which of the two a command goes by.
   */
  roomUuid?: string;
  /** `settings().hostParticipantId`; own id is `'me'` unless `myId` says otherwise. */
  hostId?: string;
  /** `settings().name`. */
  sessionName?: string;
  scale?: Scale;
  participants?: ParticipantSnapshot[];
  /** Ids with a live awareness entry; defaults to everyone in `participants`. */
  onlineIds?: string[];
  screen?: Screen | null;
  /** What `SessionAccessService` says the relay enforces. Default: open. */
  accessMode?: 'open' | 'password';
}

async function mountForCommands(opts: CommandMountOptions = {}) {
  const { Router } = await import('@angular/router');
  const { DocService } = await import('../core/doc/doc.service');
  const { HapticService } = await import('../core/haptic.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { LastSessionService } = await import('../core/last-session.service');
  const { ScalePreferenceService } = await import('../core/scale-preference.service');
  const { SurfaceService } = await import('../core/surface.service');
  const { ToastService } = await import('../services/toast.service');
  const { ExportService } = await import('../core/export.service');
  const { SessionAccessService } = await import('../core/session-access.service');
  const { AlertController, PopoverController } = await import('@ionic/angular/standalone');

  const commands = { ...UNBOUND_SESSION_COMMANDS, ...opts.commands };
  const haptic = { impactLight: vi.fn(), impactMedium: vi.fn(), impactHeavy: vi.fn() };
  const navigate = vi.fn().mockResolvedValue(true);
  const endSessionForEveryone = vi
    .fn()
    .mockReturnValue(opts.endSessionForEveryone ?? APPLIED_ROSTER);
  const teardown = vi.fn();
  const flushUpdates = vi.fn().mockResolvedValue(undefined);
  const toastError = vi.fn().mockResolvedValue(undefined);
  const lastSession = {
    record: vi.fn(),
    removeByUuid: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
  };
  const sessionExit = { exit: vi.fn().mockResolvedValue(undefined) };
  const alerts: { buttons: AlertButton[] }[] = [];
  const openSheetOrPopover = vi.fn().mockResolvedValue(undefined);
  const dismissMenu = vi.fn().mockResolvedValue(undefined);
  const updateRoundDescriptor = vi.fn();
  const accessMode = signal<'open' | 'password'>(opts.accessMode ?? 'open');
  const refreshAccess = vi.fn().mockResolvedValue(undefined);
  const roster = opts.participants ?? [];
  const hasSettings =
    opts.hostId !== undefined || opts.sessionName !== undefined || opts.scale !== undefined;
  const settings = hasSettings
    ? {
        ...(opts.hostId !== undefined && { hostParticipantId: opts.hostId }),
        ...(opts.sessionName !== undefined && { name: opts.sessionName }),
        ...(opts.scale !== undefined && { defaultScale: opts.scale }),
      }
    : undefined;
  const screen = signal<Screen | null>(opts.screen === undefined ? 'lobby' : opts.screen);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigate } },
      {
        provide: DocService,
        useValue: {
          settings: signal(settings).asReadonly(),
          roomCode: signal('ABC123').asReadonly(),
          hasSession: signal(true).asReadonly(),
          meta: signal({ roomUuid: 'uuid-from-the-doc' }).asReadonly(),
          syncStatus: signal('disconnected').asReadonly(),
          relaySynced: signal(false).asReadonly(),
          joined: signal(false).asReadonly(),
          relayRoomUuid: signal(opts.roomUuid ?? null).asReadonly(),
          currentRound: signal(undefined).asReadonly(),
          screen: screen.asReadonly(),
          lastRejection: signal(null).asReadonly(),
          rounds: signal(opts.rounds ?? []).asReadonly(),
          participants: signal(roster).asReadonly(),
          activeParticipants: signal(roster).asReadonly(),
          onlineParticipantIds: signal(
            new Set(opts.onlineIds ?? roster.map((p) => p.id)),
          ).asReadonly(),
          agenda: signal(opts.pendingAgenda ?? []).asReadonly(),
          pendingAgenda: signal(opts.pendingAgenda ?? []).asReadonly(),
          nextPendingAgendaItem: signal(null).asReadonly(),
          commands,
          endSessionForEveryone,
          updateRoundDescriptor,
          teardown,
          flushUpdates,
        },
      },
      { provide: HapticService, useValue: haptic },
      {
        provide: ParticipantIdService,
        useValue: { id: signal(opts.myId === undefined ? 'me' : opts.myId).asReadonly() },
      },
      { provide: LastSessionService, useValue: lastSession },
      { provide: SessionExitService, useValue: sessionExit },
      { provide: ScalePreferenceService, useValue: { customScales: signal([]).asReadonly() } },
      {
        provide: SurfaceService,
        useValue: {
          mode: signal('mobile').asReadonly(),
          openSheetOrPopover,
          dismissMenu,
          sheetBreakpoints: () => [0, 0.5, 1],
          initialSheetBreakpoint: () => 0.5,
          sheetBreakpointsFull: () => [0, 0.6, 1],
          initialSheetBreakpointFull: () => 1,
        },
      },
      { provide: ToastService, useValue: { show: vi.fn(), info: vi.fn(), error: toastError } },
      { provide: ExportService, useValue: { export: vi.fn() } },
      {
        provide: SessionAccessService,
        useValue: {
          mode: accessMode.asReadonly(),
          saving: signal(false).asReadonly(),
          refresh: refreshAccess,
        },
      },
      {
        provide: AlertController,
        useValue: {
          create: vi.fn().mockImplementation((cfg: { buttons: AlertButton[] }) => {
            alerts.push(cfg);
            return Promise.resolve({ present: vi.fn(), dismiss: vi.fn() });
          }),
        },
      },
      {
        provide: PopoverController,
        useValue: {
          create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
          dismiss: vi.fn().mockResolvedValue(true),
        },
      },
    ],
  });

  const { LobbyPage } = await import('./lobby.page');
  const fixture = TestBed.createComponent(LobbyPage);
  const page = fixture.componentInstance as unknown as CommandInternals;
  return {
    fixture,
    page,
    commands,
    haptic,
    navigate,
    endSessionForEveryone,
    teardown,
    flushUpdates,
    toastError,
    lastSession,
    sessionExit,
    alerts,
    openSheetOrPopover,
    dismissMenu,
    updateRoundDescriptor,
    accessMode,
    refreshAccess,
    screen,
  };
}

/** Run the handler on the last-created alert's button whose label is `text`. */
function tapAlertButton(alerts: { buttons: AlertButton[] }[], text: string): void {
  const cfg = alerts.at(-1);
  expect(cfg, 'no alert was created').toBeDefined();
  const button = cfg!.buttons.find((b) => b.text === text);
  expect(button, `no "${text}" button on the alert`).toBeDefined();
  button!.handler?.();
}

describe('LobbyPage — onToggleRole', () => {
  it('fires the haptic and reaches the bound toggleRole command', async () => {
    const toggleRole = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, haptic } = await mountForCommands({ commands: { toggleRole } });

    page.onToggleRole();

    expect(haptic.impactLight).toHaveBeenCalledTimes(1);
    expect(toggleRole).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the participant id exists', async () => {
    const toggleRole = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, haptic } = await mountForCommands({ myId: null, commands: { toggleRole } });

    page.onToggleRole();

    expect(toggleRole).not.toHaveBeenCalled();
    expect(haptic.impactLight).not.toHaveBeenCalled();
  });
});

describe('LobbyPage — onRoundStart refusal', () => {
  it('stays on Lobby when startRound refuses (no host to attribute the round to)', async () => {
    const startRound = vi.fn().mockReturnValue(REFUSED_ROUND);
    const { page, navigate } = await mountForCommands({ commands: { startRound } });

    await page.onRoundStart({ title: 'Auth', ticketId: null, description: null });

    expect(startRound).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates to Estimating when startRound applies', async () => {
    const startRound = vi.fn().mockReturnValue(APPLIED_ROUND);
    const { fixture, page, navigate } = await mountForCommands({ commands: { startRound } });
    // The mocked ion-modal stub carries no dismiss(); give the viewChild slot
    // one so the applied path can run to the navigation.
    Object.defineProperty(fixture.componentInstance, 'modalRef', {
      value: () => ({ dismiss: vi.fn().mockResolvedValue(undefined) }),
      configurable: true,
    });

    await page.onRoundStart({ title: 'Auth', ticketId: null, description: null });

    expect(navigate).toHaveBeenCalledWith(['/estimating', 'ABC123']);
  });
});

describe('LobbyPage — onRevote', () => {
  const PARENT = makeRevealedRound({
    id: 'round-1',
    title: 'Auth',
    description: 'the login form',
    ticketId: 'PROJ-42',
    agendaItemId: 'item-1',
  });

  it('carries the parent descriptor and agenda item onto the re-vote', async () => {
    const startRound = vi.fn().mockReturnValue(APPLIED_ROUND);
    const { page, navigate } = await mountForCommands({
      rounds: [PARENT],
      commands: { startRound },
    });

    await page.onRevote();

    expect(startRound).toHaveBeenCalledWith({
      parentRoundId: 'round-1',
      title: 'Auth',
      description: 'the login form',
      ticketId: 'PROJ-42',
      agendaItemId: 'item-1',
    });
    expect(navigate).toHaveBeenCalledWith(['/estimating', 'ABC123']);
  });

  it('omits descriptor fields the parent does not carry', async () => {
    const startRound = vi.fn().mockReturnValue(APPLIED_ROUND);
    const { page } = await mountForCommands({
      rounds: [makeRevealedRound()],
      commands: { startRound },
    });

    await page.onRevote();

    expect(startRound).toHaveBeenCalledWith({ parentRoundId: 'round-1' });
  });

  it('stays on Lobby when the re-vote refuses', async () => {
    const startRound = vi.fn().mockReturnValue(REFUSED_ROUND);
    const { page, navigate } = await mountForCommands({
      rounds: [PARENT],
      commands: { startRound },
    });

    await page.onRevote();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does nothing when there is no revealed round to re-vote on', async () => {
    const startRound = vi.fn().mockReturnValue(APPLIED_ROUND);
    const { page, navigate } = await mountForCommands({ commands: { startRound } });

    await page.onRevote();

    expect(startRound).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('LobbyPage — agenda item acts', () => {
  it('onAgendaSkip fires a medium haptic when the skip applies', async () => {
    const skipItem = vi.fn().mockReturnValue(APPLIED_AGENDA);
    const { page, haptic } = await mountForCommands({ commands: { skipItem } });

    page.onAgendaSkip('item-1');

    expect(skipItem).toHaveBeenCalledWith('item-1');
    expect(haptic.impactMedium).toHaveBeenCalledTimes(1);
  });

  it('onAgendaSkip fires no haptic when the skip refuses', async () => {
    const skipItem = vi.fn().mockReturnValue(REFUSED_AGENDA);
    const { page, haptic } = await mountForCommands({ commands: { skipItem } });

    page.onAgendaSkip('item-1');

    expect(haptic.impactMedium).not.toHaveBeenCalled();
  });

  it('onAgendaCancel fires a medium haptic when the cancel applies', async () => {
    const cancelItem = vi.fn().mockReturnValue(APPLIED_AGENDA);
    const { page, haptic } = await mountForCommands({ commands: { cancelItem } });

    page.onAgendaCancel('item-1');

    expect(cancelItem).toHaveBeenCalledWith('item-1');
    expect(haptic.impactMedium).toHaveBeenCalledTimes(1);
  });

  it('onAgendaCancel fires no haptic when the cancel refuses', async () => {
    const cancelItem = vi.fn().mockReturnValue(REFUSED_AGENDA);
    const { page, haptic } = await mountForCommands({ commands: { cancelItem } });

    page.onAgendaCancel('item-1');

    expect(haptic.impactMedium).not.toHaveBeenCalled();
  });
});

describe('LobbyPage — agenda reorder', () => {
  const ITEMS = [
    makePendingItem('a', 'a0'),
    makePendingItem('b', 'a1'),
    makePendingItem('c', 'a2'),
  ];

  it('reorder up passes the two neighbouring sortKeys and fires a light haptic', async () => {
    const moveItem = vi.fn().mockReturnValue(APPLIED_AGENDA);
    const { page, haptic } = await mountForCommands({
      pendingAgenda: ITEMS,
      commands: { moveItem },
    });

    page.onAgendaReorderUp('c');

    expect(moveItem).toHaveBeenCalledWith('c', 'a0', 'a1');
    expect(haptic.impactLight).toHaveBeenCalledTimes(1);
  });

  it('reorder up to the head passes a null lower bound', async () => {
    const moveItem = vi.fn().mockReturnValue(APPLIED_AGENDA);
    const { page } = await mountForCommands({ pendingAgenda: ITEMS, commands: { moveItem } });

    page.onAgendaReorderUp('b');

    expect(moveItem).toHaveBeenCalledWith('b', null, 'a0');
  });

  it('reorder up is a no-op for the first item', async () => {
    const moveItem = vi.fn().mockReturnValue(APPLIED_AGENDA);
    const { page } = await mountForCommands({ pendingAgenda: ITEMS, commands: { moveItem } });

    page.onAgendaReorderUp('a');

    expect(moveItem).not.toHaveBeenCalled();
  });

  it('reorder down passes the two neighbouring sortKeys and fires a light haptic', async () => {
    const moveItem = vi.fn().mockReturnValue(APPLIED_AGENDA);
    const { page, haptic } = await mountForCommands({
      pendingAgenda: ITEMS,
      commands: { moveItem },
    });

    page.onAgendaReorderDown('a');

    expect(moveItem).toHaveBeenCalledWith('a', 'a1', 'a2');
    expect(haptic.impactLight).toHaveBeenCalledTimes(1);
  });

  it('reorder down to the tail passes a null upper bound', async () => {
    const moveItem = vi.fn().mockReturnValue(APPLIED_AGENDA);
    const { page } = await mountForCommands({ pendingAgenda: ITEMS, commands: { moveItem } });

    page.onAgendaReorderDown('b');

    expect(moveItem).toHaveBeenCalledWith('b', 'a2', null);
  });

  it('reorder down is a no-op for the last item', async () => {
    const moveItem = vi.fn().mockReturnValue(APPLIED_AGENDA);
    const { page } = await mountForCommands({ pendingAgenda: ITEMS, commands: { moveItem } });

    page.onAgendaReorderDown('c');

    expect(moveItem).not.toHaveBeenCalled();
  });

  it('reorder fires no haptic when the move refuses', async () => {
    const moveItem = vi.fn().mockReturnValue(REFUSED_AGENDA);
    const { page, haptic } = await mountForCommands({
      pendingAgenda: ITEMS,
      commands: { moveItem },
    });

    page.onAgendaReorderDown('a');

    expect(haptic.impactLight).not.toHaveBeenCalled();
  });
});

describe('LobbyPage — confirmEndSession', () => {
  it('fires a heavy haptic when the host gate lets the end through', async () => {
    const { page, haptic, endSessionForEveryone, alerts } = await mountForCommands({
      endSessionForEveryone: APPLIED_ROSTER,
    });

    await page.confirmEndSession();
    tapAlertButton(alerts, 'End session');

    expect(endSessionForEveryone).toHaveBeenCalledTimes(1);
    expect(haptic.impactHeavy).toHaveBeenCalledTimes(1);
  });

  it('fires no haptic when the shared host gate refuses underneath the UI gate', async () => {
    const { page, haptic, alerts } = await mountForCommands({
      endSessionForEveryone: REFUSED_ROSTER,
    });

    await page.confirmEndSession();
    tapAlertButton(alerts, 'End session');

    expect(haptic.impactHeavy).not.toHaveBeenCalled();
  });

  it('does not reach the command before the participant id exists', async () => {
    const { page, endSessionForEveryone, alerts } = await mountForCommands({ myId: null });

    await page.confirmEndSession();
    tapAlertButton(alerts, 'End session');

    expect(endSessionForEveryone).not.toHaveBeenCalled();
  });
});

// What leaving does (write `leave`, flush, tear down, forget, Home) is
// `SessionExitService`'s `left` exit and is tested there.
describe('LobbyPage — leaveSession', () => {
  it('leaves the session as left once Leave is confirmed', async () => {
    const { page, sessionExit, alerts, haptic } = await mountForCommands();

    await page.confirmLeave();
    tapAlertButton(alerts, 'Leave');

    expect(haptic.impactHeavy).toHaveBeenCalledTimes(1);
    expect(sessionExit.exit).toHaveBeenCalledExactlyOnceWith({ kind: 'left' });
  });

  it('stays in the session when Leave is cancelled', async () => {
    const { page, sessionExit, alerts, haptic } = await mountForCommands();

    await page.confirmLeave();
    tapAlertButton(alerts, 'Cancel');

    expect(haptic.impactHeavy).not.toHaveBeenCalled();
    expect(sessionExit.exit).not.toHaveBeenCalled();
  });
});

describe('LobbyPage — onHandoffTap', () => {
  it('fires a medium haptic when the handoff applies', async () => {
    const handoffHost = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, haptic, alerts } = await mountForCommands({ commands: { handoffHost } });

    await page.onHandoffTap('them', 'Ada');
    tapAlertButton(alerts, 'Make host');

    expect(handoffHost).toHaveBeenCalledWith('them');
    expect(haptic.impactMedium).toHaveBeenCalledTimes(1);
  });

  it('fires no haptic when the target is offline and the command refuses', async () => {
    const handoffHost = vi
      .fn()
      .mockReturnValue({ applied: false, reason: 'not-online' } satisfies RosterResult);
    const { page, haptic, alerts } = await mountForCommands({ commands: { handoffHost } });

    await page.onHandoffTap('them', 'Ada');
    tapAlertButton(alerts, 'Make host');

    expect(haptic.impactMedium).not.toHaveBeenCalled();
  });

  it('does not reach the command before the participant id exists', async () => {
    const handoffHost = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, alerts } = await mountForCommands({ myId: null, commands: { handoffHost } });

    await page.onHandoffTap('them', 'Ada');
    tapAlertButton(alerts, 'Make host');

    expect(handoffHost).not.toHaveBeenCalled();
  });
});

describe('LobbyPage — onRemoveTap', () => {
  it('fires a heavy haptic when the kick applies', async () => {
    const kick = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, haptic, alerts } = await mountForCommands({ commands: { kick } });

    await page.onRemoveTap('them', 'Ada');
    tapAlertButton(alerts, 'Remove');

    expect(kick).toHaveBeenCalledWith('them');
    expect(haptic.impactHeavy).toHaveBeenCalledTimes(1);
  });

  it('fires no haptic when the host gate refuses the kick', async () => {
    const kick = vi.fn().mockReturnValue(REFUSED_ROSTER);
    const { page, haptic, alerts } = await mountForCommands({ commands: { kick } });

    await page.onRemoveTap('them', 'Ada');
    tapAlertButton(alerts, 'Remove');

    expect(haptic.impactHeavy).not.toHaveBeenCalled();
  });

  it('does not reach the command before the participant id exists', async () => {
    const kick = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, alerts } = await mountForCommands({ myId: null, commands: { kick } });

    await page.onRemoveTap('them', 'Ada');
    tapAlertButton(alerts, 'Remove');

    expect(kick).not.toHaveBeenCalled();
  });
});

// Host / joiner split
//
// One screen for both. What differs is what each can do, and that has to be
// visible: the host gets the round buttons, a menu, and an actions button on
// every other roster row; a joiner gets a one-tap Leave and a line saying what
// they are waiting for.

const ADA: ParticipantSnapshot = { id: 'me', displayName: 'Ada', joinedAt: 1 };
const BOB: ParticipantSnapshot = { id: 'bob', displayName: 'Bob', joinedAt: 2 };
const CY: ParticipantSnapshot = { id: 'cy', displayName: 'Cy', joinedAt: 3, role: 'viewer' };

function render(fixture: { detectChanges(): void; nativeElement: unknown }): HTMLElement {
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function textOf(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('LobbyPage — toolbar', () => {
  it('gives the host a menu', async () => {
    const { fixture } = await mountForCommands({ hostId: 'me' });
    const el = render(fixture);
    expect(el.querySelector('ion-button[aria-label="More options"]')).not.toBeNull();
    expect(el.querySelector('ion-button[aria-label="Leave session"]')).toBeNull();
  });

  it('gives everyone else a one-tap Leave instead of a one-item menu', async () => {
    const { fixture, alerts } = await mountForCommands({ hostId: 'bob' });
    const el = render(fixture);
    expect(el.querySelector('ion-button[aria-label="More options"]')).toBeNull();

    const leave = el.querySelector<HTMLElement>('ion-button[aria-label="Leave session"]');
    expect(leave).not.toBeNull();
    leave!.click();
    // Still behind a confirmation: leaving is destructive.
    await vi.waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]!.buttons.map((b) => b.text)).toEqual(['Cancel', 'Leave']);
  });

  it('is titled with the session name', async () => {
    const { fixture } = await mountForCommands({ hostId: 'me', sessionName: ' Sprint 12 ' });
    expect(textOf(render(fixture).querySelector('ion-title'))).toBe('Sprint 12');
  });

  it('is titled "Lobby" when the session has no name', async () => {
    const { fixture } = await mountForCommands({ hostId: 'me' });
    expect(textOf(render(fixture).querySelector('ion-title'))).toBe('Lobby');
  });
});

describe('LobbyPage — host menu', () => {
  interface MenuInternals {
    openActionSheet(event: Event): Promise<void>;
    confirmLeave(): Promise<void>;
    confirmEndSession(): Promise<void>;
  }
  interface MenuOptions {
    items: { text: string; role?: string; handler?: () => void }[];
    triggerEvent: Event;
  }

  it('lists settings, end, leave and cancel, in that order', async () => {
    const { fixture, openSheetOrPopover } = await mountForCommands({ hostId: 'me' });
    const event = new Event('click');

    await (fixture.componentInstance as unknown as MenuInternals).openActionSheet(event);

    const [opts] = openSheetOrPopover.mock.calls[0] as [MenuOptions];
    expect(opts.items.map((item) => item.text)).toEqual([
      'Session settings',
      'End session for everyone',
      'Leave session',
      'Cancel',
    ]);
    expect(opts.items.map((item) => item.role)).toEqual([
      undefined,
      'destructive',
      'destructive',
      'cancel',
    ]);
    expect(opts.triggerEvent).toBe(event);
  });

  it('routes the destructive items through their confirmations', async () => {
    const { fixture, openSheetOrPopover, alerts } = await mountForCommands({ hostId: 'me' });
    await (fixture.componentInstance as unknown as MenuInternals).openActionSheet(
      new Event('click'),
    );
    const [opts] = openSheetOrPopover.mock.calls[0] as [MenuOptions];

    opts.items[1]!.handler?.();
    await vi.waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]!.buttons.map((b) => b.text)).toEqual(['Cancel', 'End session']);

    opts.items[2]!.handler?.();
    await vi.waitFor(() => expect(alerts).toHaveLength(2));
    expect(alerts[1]!.buttons.map((b) => b.text)).toEqual(['Cancel', 'Leave']);
  });
});

describe('LobbyPage — round controls', () => {
  function footerButtons(el: HTMLElement): string[] {
    return [...el.querySelectorAll('ion-footer ion-button')].map((b) => textOf(b));
  }

  it('host: "Start round 1" and nothing to re-vote before any result', async () => {
    const { fixture } = await mountForCommands({ hostId: 'me' });
    expect(footerButtons(render(fixture))).toEqual(['Start round 1']);
  });

  it('host: Re-vote beside "Next round 2" once a round is revealed', async () => {
    const { fixture } = await mountForCommands({ hostId: 'me', rounds: [makeRevealedRound()] });
    expect(footerButtons(render(fixture))).toEqual(['Re-vote', 'Next round 2']);
  });

  it('host: a skipped round has no result to re-vote on', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      rounds: [makeRevealedRound({ status: 'skipped' })],
    });
    expect(footerButtons(render(fixture))).toEqual(['Next round 2']);
  });

  it('host: a cancelled round takes no number — the first round is still round 1', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      rounds: [makeRevealedRound({ status: 'discarded' })],
    });
    expect(footerButtons(render(fixture))).toEqual(['Start round 1']);
  });

  it('host: a cancelled round between two results leaves no gap', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      rounds: [
        makeRevealedRound({ id: 'r1' }),
        makeRevealedRound({ id: 'r2', status: 'discarded' }),
      ],
    });
    expect(footerButtons(render(fixture))).toEqual(['Re-vote', 'Next round 2']);
  });

  it('host: is not told to wait for themselves', async () => {
    const { fixture } = await mountForCommands({ hostId: 'me', participants: [ADA, BOB] });
    expect(render(fixture).querySelector('.waiting-note')).toBeNull();
  });

  it('joiner: no round buttons, and a line saying who they are waiting for', async () => {
    const { fixture } = await mountForCommands({ hostId: 'bob', participants: [ADA, BOB] });
    const el = render(fixture);
    expect(el.querySelector('ion-footer')).toBeNull();
    expect(textOf(el.querySelector('.waiting-note'))).toBe(
      'Waiting for Bob to start the first round.',
    );
  });

  it('joiner: waits for the next round once there is a result', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'bob',
      participants: [ADA, BOB],
      rounds: [makeRevealedRound()],
    });
    expect(textOf(render(fixture).querySelector('.waiting-note'))).toBe(
      'Waiting for Bob to start the next round.',
    );
  });

  it('joiner: waits for "the host" when the host has left the roster', async () => {
    const { fixture } = await mountForCommands({ hostId: 'gone', participants: [ADA] });
    expect(textOf(render(fixture).querySelector('.waiting-note'))).toBe(
      'Waiting for the host to start the first round.',
    );
  });
});

describe('LobbyPage — results card', () => {
  it('is absent until a round has finished', async () => {
    const { fixture } = await mountForCommands({ hostId: 'me' });
    expect(render(fixture).querySelector('.results-card')).toBeNull();
  });

  it('is headed with the round number in the session', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      rounds: [makeRevealedRound({ id: 'r1' }), makeRevealedRound({ id: 'r2' })],
    });
    const heading = render(fixture).querySelector('.results-heading');
    expect(textOf(heading)).toBe('Round 2 results');
  });

  it('does not count a cancelled round in that number', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      rounds: [
        makeRevealedRound({ id: 'r1', status: 'discarded' }),
        makeRevealedRound({ id: 'r2' }),
      ],
    });
    const heading = render(fixture).querySelector('.results-heading');
    expect(textOf(heading)).toBe('Round 1 results');
  });

  it('notes a re-vote beside the heading', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      rounds: [
        makeRevealedRound({ id: 'r1' }),
        makeRevealedRound({ id: 'r2', parentRoundId: 'r1' }),
      ],
    });
    const heading = render(fixture).querySelector('.results-heading');
    expect(textOf(heading)).toBe('Round 2 results Re-vote');
    expect(textOf(heading?.querySelector('.hnch-card__title-note'))).toBe('Re-vote');
  });

  it('says so when the round was skipped, and shows no chart', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      rounds: [makeRevealedRound({ status: 'skipped' })],
    });
    const el = render(fixture);
    expect(textOf(el.querySelector('.round-skipped'))).toBe('Round skipped');
    expect(el.querySelector('app-vote-results')).toBeNull();
  });

  it('lets the host, and only the host, edit the round', async () => {
    const asHost = await mountForCommands({ hostId: 'me', rounds: [makeRevealedRound()] });
    expect(render(asHost.fixture).querySelector('.results-card .edit-btn')).not.toBeNull();

    const asJoiner = await mountForCommands({ hostId: 'bob', rounds: [makeRevealedRound()] });
    expect(render(asJoiner.fixture).querySelector('.results-card .edit-btn')).toBeNull();
  });

  it('shows History only when an older round exists', async () => {
    const one = await mountForCommands({ hostId: 'me', rounds: [makeRevealedRound()] });
    expect(render(one.fixture).querySelector('.history-card')).toBeNull();

    const two = await mountForCommands({
      hostId: 'me',
      rounds: [makeRevealedRound({ id: 'r1' }), makeRevealedRound({ id: 'r2' })],
    });
    expect(render(two.fixture).querySelector('.history-card')).not.toBeNull();
  });
});

describe('LobbyPage — roster', () => {
  function rows(el: HTMLElement): Element[] {
    return [...el.querySelectorAll('ion-list.participants ion-item')];
  }

  it('counts the participants in the heading', async () => {
    const { fixture } = await mountForCommands({ hostId: 'me', participants: [ADA, BOB, CY] });
    expect(textOf(render(fixture).querySelector('.participants-card h2'))).toBe('Participants (3)');
  });

  it('own row reads "You (Ada)" and carries the role switch', async () => {
    const toggleRole = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { fixture } = await mountForCommands({
      hostId: 'bob',
      participants: [ADA, BOB],
      commands: { toggleRole },
    });
    const [own, other] = rows(render(fixture));

    expect(textOf(own!.querySelector('.participant-name'))).toBe('You (Ada)');
    // Read as what it shows: a label on the row would stand in for the badge
    // and the status beside the name.
    expect(own!.hasAttribute('aria-label')).toBe(false);
    expect(own!.querySelector('app-role-toggle')).not.toBeNull();

    expect(textOf(other!.querySelector('.participant-name'))).toBe('Bob');
    expect(other!.querySelector('app-role-toggle')).toBeNull();
  });

  it('badges the host, whoever is looking', async () => {
    const { fixture } = await mountForCommands({ hostId: 'bob', participants: [ADA, BOB] });
    const [own, other] = rows(render(fixture));
    expect(own!.querySelector('.host-badge')).toBeNull();
    expect(textOf(other!.querySelector('.host-badge'))).toBe('Host');
  });

  it('host: an actions button on every row but their own', async () => {
    const { fixture, openSheetOrPopover } = await mountForCommands({
      hostId: 'me',
      participants: [ADA, BOB, CY],
    });
    const [own, bob, cy] = rows(render(fixture));

    expect(own!.querySelector('.participant-menu-btn')).toBeNull();
    expect(cy!.querySelector('.participant-menu-btn')).not.toBeNull();

    const button = bob!.querySelector<HTMLElement>('.participant-menu-btn');
    expect(button?.getAttribute('aria-label')).toBe('Host actions for Bob');
    button!.click();
    await vi.waitFor(() => expect(openSheetOrPopover).toHaveBeenCalledTimes(1));
    const [opts] = openSheetOrPopover.mock.calls[0] as [{ header?: string }];
    expect(opts.header).toBe('Bob');
  });

  it('joiner: no actions button anywhere', async () => {
    const { fixture } = await mountForCommands({ hostId: 'bob', participants: [ADA, BOB, CY] });
    expect(render(fixture).querySelector('.participant-menu-btn')).toBeNull();
  });

  it('notes who is observing and who is offline', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      participants: [ADA, BOB, CY],
      onlineIds: ['me', 'cy'],
    });
    const [own, bob, cy] = rows(render(fixture));

    expect(own!.querySelector('ion-note')).toBeNull();
    expect(own!.classList.contains('offline')).toBe(false);

    expect(textOf(bob!.querySelector('ion-note'))).toBe('Offline');
    expect(bob!.classList.contains('offline')).toBe(true);

    expect(textOf(cy!.querySelector('ion-note'))).toBe('Observer');
    expect(cy!.classList.contains('offline')).toBe(false);
  });

  it('offline wins over observer: one note per row', async () => {
    const { fixture } = await mountForCommands({
      hostId: 'me',
      participants: [ADA, CY],
      onlineIds: ['me'],
    });
    const [, cy] = rows(render(fixture));
    expect([...cy!.querySelectorAll('ion-note')].map((n) => textOf(n))).toEqual(['Offline']);
  });
});

// Access mode — relay state (ADR-0009), kept by `SessionAccessService`. The
// Lobby shows what that service knows and asks it to look again on entry. A
// session created with a password, reloaded, or locked by a previous host
// used to show as open, and its invite link lost the `pw=1` hint that makes
// Join ask for the password up front.

describe('LobbyPage — access mode', () => {
  interface AccessInternals {
    subtitle(): string;
    inviteUrl(): string;
    passwordProtected(): boolean;
    ionViewWillEnter(): void;
  }
  const FIBONACCI: Scale = { id: 'fibonacci', cards: ['1', '2', '3'] };

  async function mountAccess(mode: 'open' | 'password' = 'open') {
    const mounted = await mountForCommands({ hostId: 'me', scale: FIBONACCI, accessMode: mode });
    mounted.fixture.detectChanges();
    return {
      ...mounted,
      page: mounted.fixture.componentInstance as unknown as AccessInternals,
    };
  }

  it('says so when the session is locked, and hints at it in the invite link', async () => {
    const { page } = await mountAccess('password');

    expect(page.passwordProtected()).toBe(true);
    expect(page.subtitle()).toBe('Fibonacci · Password protected');
    expect(page.inviteUrl()).toMatch(/\/join\?code=ABC123&pw=1$/);
  });

  it('shows the lock on the summary line', async () => {
    const { fixture } = await mountAccess('password');

    const summary = (fixture.nativeElement as HTMLElement).querySelector('button.subtitle');
    expect(summary?.querySelector('ion-icon[name="lock-closed-outline"]')).not.toBeNull();
    expect(summary?.getAttribute('aria-label')).toBe(
      'Edit session settings: Fibonacci · Password protected',
    );
  });

  it('shows no lock on an open session', async () => {
    const { fixture, page } = await mountAccess('open');

    expect(page.passwordProtected()).toBe(false);
    expect(page.subtitle()).toBe('Fibonacci');
    expect(page.inviteUrl()).toMatch(/\/join\?code=ABC123$/);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('ion-icon[name="lock-closed-outline"]'),
    ).toBeNull();
  });

  // The sheet that makes the change is usually gone before the relay has
  // answered; the Lobby follows the service, not the sheet.
  it('follows a change as soon as the relay has taken it', async () => {
    const { fixture, page, accessMode } = await mountAccess('open');

    accessMode.set('password');
    fixture.detectChanges();
    expect(page.subtitle()).toBe('Fibonacci · Password protected');

    accessMode.set('open');
    fixture.detectChanges();
    expect(page.subtitle()).toBe('Fibonacci');
  });

  it('asks again on every entry, so a change made elsewhere shows up', async () => {
    const { page, refreshAccess } = await mountAccess();
    refreshAccess.mockClear();

    page.ionViewWillEnter();

    expect(refreshAccess).toHaveBeenCalledTimes(1);
  });
});

// Re-entry. Ionic keeps the Lobby alive under Estimating and re-shows the
// same instance on Back; nothing the autoNav effect reads has changed by
// then, so it does not run again. Without the hook the host could sit on the
// Lobby — and open its sheets — while everyone else was voting.

describe('LobbyPage — ionViewWillEnter', () => {
  interface EnterInternals {
    ionViewWillEnter(): void;
  }

  it('sends the user back to Estimating while a round is running', async () => {
    const { fixture, navigate } = await mountForCommands({ screen: 'estimating' });
    TestBed.flushEffects();
    expect(navigate).toHaveBeenCalledTimes(1);

    (fixture.componentInstance as unknown as EnterInternals).ionViewWillEnter();

    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenLastCalledWith(['/estimating', 'ABC123']);
  });

  it('stays between rounds', async () => {
    const { fixture, navigate } = await mountForCommands({ screen: 'lobby' });
    (fixture.componentInstance as unknown as EnterInternals).ionViewWillEnter();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays while the projection has not loaded', async () => {
    const { fixture, navigate } = await mountForCommands({ screen: null });
    (fixture.componentInstance as unknown as EnterInternals).ionViewWillEnter();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('LobbyPage — openSessionSettings', () => {
  interface SettingsInternals {
    openSessionSettings(): void;
  }

  async function mountWithSettingsModal(hostId: string) {
    const mounted = await mountForCommands({ hostId });
    const present = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(mounted.fixture.componentInstance, 'sessionSettingsModalRef', {
      value: () => ({ present, onDidDismiss: () => new Promise(() => undefined) }),
      configurable: true,
    });
    return {
      present,
      page: mounted.fixture.componentInstance as unknown as SettingsInternals,
    };
  }

  it('opens the sheet for the host', async () => {
    const { page, present } = await mountWithSettingsModal('me');
    page.openSessionSettings();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('does nothing for anyone else', async () => {
    const { page, present } = await mountWithSettingsModal('bob');
    page.openSessionSettings();
    expect(present).not.toHaveBeenCalled();
  });
});

describe('LobbyPage — leaving the page', () => {
  type Internals = {
    ionViewWillLeave(): void;
    qrOpen: { (): boolean; set(v: boolean): void };
    roundEditOpen: { (): boolean; set(v: boolean): void };
    agendaFormOpen: { (): boolean; set(v: boolean): void };
    sessionSettingsOpen: { (): boolean; set(v: boolean): void };
    roundStartOpen: { (): boolean; set(v: boolean): void };
  };

  // The host starting a round moves everyone to Estimating; a sheet left open
  // would sit on top of it and switch off the voting keys.
  it('closes the menu and every sheet it opened', async () => {
    const { fixture, dismissMenu } = await mountForCommands({ hostId: 'me' });
    const page = fixture.componentInstance as unknown as Internals;
    page.qrOpen.set(true);
    page.roundEditOpen.set(true);
    page.agendaFormOpen.set(true);
    page.sessionSettingsOpen.set(true);
    page.roundStartOpen.set(true);

    page.ionViewWillLeave();

    expect(dismissMenu).toHaveBeenCalledTimes(1);
    expect(page.qrOpen()).toBe(false);
    expect(page.roundEditOpen()).toBe(false);
    expect(page.agendaFormOpen()).toBe(false);
    expect(page.sessionSettingsOpen()).toBe(false);
    expect(page.roundStartOpen()).toBe(false);
  });
});

describe('LobbyPage — editing a round', () => {
  type Internals = {
    openRoundEdit(round: Round): void;
    onRoundEditSave(payload: { title: string; description: string | null }): void;
    onRoundEditDismiss(): void;
    roundEditOpen(): boolean;
    editingRound(): Round | null;
  };
  const ROUND = makeRound({ id: 'r1', status: 'revealed', title: 'Login', description: 'Old' });

  async function mountWithRound() {
    const { fixture, updateRoundDescriptor } = await mountForCommands({ hostId: 'me' });
    const page = fixture.componentInstance as unknown as Internals;
    page.openRoundEdit(ROUND);
    return { page, updateRoundDescriptor };
  }

  // Clearing the round on Save or Cancel emptied the sheet while it was still
  // sliding out.
  it('Save closes the sheet and keeps the round until the sheet is gone', async () => {
    const { page } = await mountWithRound();

    page.onRoundEditSave({ title: 'Login v2', description: 'New' });
    expect(page.roundEditOpen()).toBe(false);
    expect(page.editingRound()).toBe(ROUND);

    page.onRoundEditDismiss();
    expect(page.editingRound()).toBeNull();
  });

  it('writes an emptied description as empty, so the old text does not stay', async () => {
    const { page, updateRoundDescriptor } = await mountWithRound();

    page.onRoundEditSave({ title: 'Login', description: null });

    expect(updateRoundDescriptor).toHaveBeenCalledWith('r1', { title: 'Login', description: '' });
  });
});

describe('LobbyPage — host menu', () => {
  // The button is not rendered for anyone else; this is the handler refusing too.
  it('does not open for someone who is not the host', async () => {
    const { fixture, openSheetOrPopover } = await mountForCommands({ hostId: 'bob' });
    await (
      fixture.componentInstance as unknown as { openActionSheet(e: Event): Promise<void> }
    ).openActionSheet(new Event('click'));
    expect(openSheetOrPopover).not.toHaveBeenCalled();
  });
});
