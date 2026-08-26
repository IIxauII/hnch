/**
 * Unit tests for the LobbyPage role predicate and the subtitle computed
 * (custom-scale label resolution). The chip-color and chip-label
 * expressions live inline in the template — those remain e2e-covered.
 */

import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { UNBOUND_SESSION_COMMANDS } from '@hnch/shared';
import type {
  AgendaItem,
  AgendaResult,
  CustomScale,
  JoinRejectionReason,
  ParticipantSnapshot,
  RosterResult,
  Round,
  RoundResult,
  Scale,
  Screen,
  SessionCommands,
} from '@hnch/shared';

import { buildCopyRoomCodeToast, buildResultsHeading, isParticipantViewer } from './lobby-helpers';

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
    expect(buildCopyRoomCodeToast(true, 'K7P-9MR')).toBe('Room code copied');
  });

  it('failure path surfaces the dash-formatted code so the user can read it', () => {
    expect(buildCopyRoomCodeToast(false, 'K7P-9MR')).toBe("Couldn't copy — code is K7P-9MR");
  });

  it('failure path preserves whatever code string is passed (no reformatting)', () => {
    expect(buildCopyRoomCodeToast(false, 'ABC-XYZ')).toBe("Couldn't copy — code is ABC-XYZ");
  });
});

// ---------------------------------------------------------------------------
// buildResultsHeading — issue #111 re-vote breadcrumb
// ---------------------------------------------------------------------------

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
  it('empty string when no round', () => {
    expect(buildResultsHeading(null, null, [])).toBe('');
  });

  it('empty string when roundIndex missing', () => {
    const r1 = makeRound({ id: 'r1' });
    expect(buildResultsHeading(r1, null, [r1])).toBe('');
  });

  it('plain "Round N Results" for standalone round (AC#3)', () => {
    const r1 = makeRound({ id: 'r1' });
    expect(buildResultsHeading(r1, 1, [r1])).toBe('Round 1 Results');
  });

  it('chain root keeps plain "Round N Results" (AC#4)', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(buildResultsHeading(r1, 1, [r1, r2])).toBe('Round 1 Results');
  });

  it('re-voted depth-2 of 2 → "Round 2 of 2 Results" (AC#1)', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(buildResultsHeading(r2, 2, [r1, r2])).toBe('Round 2 of 2 Results');
  });

  it('3-deep leaf → "Round 3 of 3 Results" (AC#5)', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    const r3 = makeRound({ id: 'r3', parentRoundId: 'r2' });
    expect(buildResultsHeading(r3, 3, [r1, r2, r3])).toBe('Round 3 of 3 Results');
  });

  it('AC#2 retroactive: middle round shows updated total when third re-vote added', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(buildResultsHeading(r2, 2, [r1, r2])).toBe('Round 2 of 2 Results');
    const r3 = makeRound({ id: 'r3', parentRoundId: 'r2' });
    expect(buildResultsHeading(r2, 2, [r1, r2, r3])).toBe('Round 2 of 3 Results');
  });

  it('missing parent ref falls back to plain "Round N Results" (AC#6)', () => {
    const orphan = makeRound({ id: 'r2', parentRoundId: 'missing' });
    expect(buildResultsHeading(orphan, 1, [orphan])).toBe('Round 1 Results');
  });
});

// ---------------------------------------------------------------------------
// LobbyPage.subtitle — exercises getScaleLabel(id, customScales()) at line 649
// ---------------------------------------------------------------------------

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
    IonAccordion: stub('ion-accordion'),
    IonAccordionGroup: stub('ion-accordion-group'),
    IonAvatar: stub('ion-avatar'),
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonChip: stub('ion-chip'),
    IonCol: stub('ion-col'),
    IonContent: stub('ion-content'),
    IonFooter: stub('ion-footer'),
    IonGrid: stub('ion-grid'),
    IonHeader: stub('ion-header'),
    IonIcon: stub('ion-icon'),
    IonInput: stub('ion-input'),
    IonItem: stub('ion-item'),
    IonItemOption: stub('ion-item-option'),
    IonItemOptions: stub('ion-item-options'),
    IonItemSliding: stub('ion-item-sliding'),
    IonLabel: stub('ion-label'),
    IonBadge: stub('ion-badge'),
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonModal: stub('ion-modal'),
    IonNote: stub('ion-note'),
    IonRow: stub('ion-row'),
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
  ellipsisHorizontalCircle: '',
  ellipsisVertical: '',
  listOutline: '',
  logOutOutline: '',
  pencilOutline: '',
  peopleOutline: '',
  personCircleOutline: '',
  personRemoveOutline: '',
  qrCodeOutline: '',
  settingsOutline: '',
  shareOutline: '',
  starOutline: '',
  statsChartOutline: '',
  timeOutline: '',
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(), canShare: vi.fn() } }));

const stubStandalone = async (selector: string, name: string) => {
  const { Component } = await import('@angular/core');
  @Component({ selector, template: '', standalone: true })
  class S {}
  return { [name]: S };
};
vi.mock('../core/connection-chip.component', () =>
  stubStandalone('app-connection-chip', 'ConnectionChipComponent'),
);
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
vi.mock('../shared/round-history.component', () =>
  stubStandalone('app-round-history', 'RoundHistoryComponent'),
);
vi.mock('../shared/vote-results.component', () =>
  stubStandalone('app-vote-results', 'VoteResultsComponent'),
);
vi.mock('./qr-display.sheet', () =>
  stubStandalone('app-qr-display-sheet', 'QrDisplaySheetComponent'),
);
vi.mock('../join/join.page', () => ({ rejectionCopy: () => 'rejected' }));
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

// ---------------------------------------------------------------------------
// LobbyPage subtitle affordance — host vs viewer rendering
// ---------------------------------------------------------------------------

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

  it('non-host with non-empty subtitle renders ion-chip.subtitle-chip, no button.subtitle', async () => {
    const fixture = await mountLobbySubtitleAffordance({ isHost: false, subtitle: 'My Scale' });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('button.subtitle')).toBeNull();
    expect(el.querySelector('ion-chip.subtitle-chip')).not.toBeNull();
  });

  it('empty subtitle renders neither button.subtitle nor ion-chip.subtitle-chip', async () => {
    const fixture = await mountLobbySubtitleAffordance({ isHost: true, subtitle: '' });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('button.subtitle')).toBeNull();
    expect(el.querySelector('ion-chip.subtitle-chip')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LobbyPage.onCopyRoomCode — tap-to-copy handler (issue #116)
// ---------------------------------------------------------------------------

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
    expect(info).toHaveBeenCalledWith('Room code copied');
  });

  it('failure path: clipboard rejection still fires fallback toast with code inline', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const { fixture, info } = await mountWithToast({ roomCode: 'XYZ789', writeText });
    const internals = fixture.componentInstance as unknown as Internals;
    await internals.onCopyRoomCode();
    expect(writeText).toHaveBeenCalledWith('XYZ-789');
    expect(info).toHaveBeenCalledWith("Couldn't copy — code is XYZ-789");
  });

  it('empty room code: early-returns without touching clipboard or toast', async () => {
    const { fixture, info, writeText } = await mountWithToast({ roomCode: '' });
    const internals = fixture.componentInstance as unknown as Internals;
    await internals.onCopyRoomCode();
    expect(writeText).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LobbyPage.openParticipantActions — desktop host-actions popover
// ---------------------------------------------------------------------------

describe('LobbyPage — openParticipantActions', () => {
  type Internals = {
    openParticipantActions(p: { id: string; displayName: string }, event: Event): Promise<void>;
    onHandoffTap(id: string, name: string): Promise<void>;
    onRemoveTap(id: string, name: string): Promise<void>;
  };

  async function mountWithSurface() {
    const { Router } = await import('@angular/router');
    const { DocService } = await import('../core/doc/doc.service');
    const { HapticService } = await import('../core/haptic.service');
    const { ParticipantIdService } = await import('../core/participant-id.service');
    const { LastSessionService } = await import('../core/last-session.service');
    const { ScalePreferenceService } = await import('../core/scale-preference.service');
    const { SurfaceService } = await import('../core/surface.service');
    const { ToastService } = await import('../services/toast.service');
    const { ExportService } = await import('../core/export.service');
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
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
        {
          provide: SurfaceService,
          useValue: {
            mode: signal('desktop').asReadonly(),
            openSheetOrPopover,
            sheetBreakpoints: () => [0, 0.5, 1],
            initialSheetBreakpoint: () => 0.5,
            sheetBreakpointsFull: () => [0, 0.6, 1],
            initialSheetBreakpointFull: () => 1,
          },
        },
        { provide: ToastService, useValue: { show: vi.fn(), info: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
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

  it('calls openSheetOrPopover with 2 items, correct labels, destructive role, and triggerEvent', async () => {
    const { fixture, openSheetOrPopover } = await mountWithSurface();
    const internals = fixture.componentInstance as unknown as Internals;
    const fakeEvent = new Event('click');
    const p = { id: 'p1', displayName: 'Alice' };

    await internals.openParticipantActions(p, fakeEvent);

    expect(openSheetOrPopover).toHaveBeenCalledTimes(1);
    const [opts] = openSheetOrPopover.mock.calls[0] as [
      { items: { text: string; role?: string }[]; triggerEvent: Event },
    ];
    expect(opts.items).toHaveLength(2);
    expect(opts.items[0]!.text).toBe('Make host');
    expect(opts.items[1]!.text).toBe('Remove');
    expect(opts.items[1]!.role).toBe('destructive');
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
});

// ---------------------------------------------------------------------------
// LobbyPage.ngOnDestroy — dismisses popover and swallows rejections
// ---------------------------------------------------------------------------

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
        {
          provide: ScalePreferenceService,
          useValue: { customScales: signal([]).asReadonly() },
        },
        {
          provide: SurfaceService,
          useValue: {
            mode: signal('desktop').asReadonly(),
            openSheetOrPopover: vi.fn().mockResolvedValue(undefined),
            sheetBreakpoints: () => [0, 0.5, 1],
            initialSheetBreakpoint: () => 0.5,
            sheetBreakpointsFull: () => [0, 0.6, 1],
            initialSheetBreakpointFull: () => 1,
          },
        },
        { provide: ToastService, useValue: { show: vi.fn(), info: vi.fn(), error: vi.fn() } },
        { provide: ExportService, useValue: { export: vi.fn() } },
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

// ---------------------------------------------------------------------------
// LobbyPage.closeRoundStart — Cancel button dismisses modal (regression for
// presentSheet vs [isOpen] mismatch — reported by Phase 4 e2e agent)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// LobbyPage — terminal-round computeds (status-driven, issue #468)
// lastRevealedRound / lastRoundWasSkipped / pastRevealedRounds branch on the
// projection `status` now that the raw terminal timestamps are gone.
// ---------------------------------------------------------------------------

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
    // pastRevealedRounds = all non-active rounds except the anchor — the
    // discarded round is a non-active terminal and is retained here (the
    // history component tombstone-filters separately).
    expect(c.pastRevealedRounds().map((r) => r.id)).toEqual(['r2']);
  });

  it('lastRevealedRound is null when no round has ended', async () => {
    const c = await mountWithRounds([makeRound({ id: 'r1', status: 'voting' })]);
    expect(c.lastRevealedRound()).toBeNull();
    expect(c.lastRoundWasSkipped()).toBe(false);
    expect(c.pastRevealedRounds()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LobbyPage autoNav effect: wiring only — the `DocService.screen` signal
// drives the navigation. The rule itself is the shared `screenFor` selector
// and is tested there against plain projections (issue #508). What is
// asserted here is the destination, the history behaviour (a push, not a
// replace — unlike Estimating's), and the pre-load `null` guard.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Agenda form submit — the one deliberate UX consequence of #507.
//
// Wiring only: the gate that produces the refusal is pinned in
// `@hnch/shared`'s agenda-commands.test.ts. What matters here is client
// behaviour — an edit that refuses (a peer cancelled the item while this form
// was open) must leave the modal on screen rather than dismissing it and
// eating the user's typing.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------

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
  /** `meta().roomUuid`; omitted exercises the `clearAll` leave branch. */
  roomUuid?: string;
  lastRejection?: WritableSignal<JoinRejectionReason | null>;
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
  const alerts: { buttons: AlertButton[] }[] = [];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigate } },
      {
        provide: DocService,
        useValue: {
          settings: signal(undefined).asReadonly(),
          roomCode: signal('ABC123').asReadonly(),
          meta: signal(
            opts.roomUuid === undefined ? undefined : { roomUuid: opts.roomUuid },
          ).asReadonly(),
          syncStatus: signal('disconnected').asReadonly(),
          currentRound: signal(undefined).asReadonly(),
          screen: signal('lobby').asReadonly(),
          lastRejection: (opts.lastRejection ?? signal(null)).asReadonly(),
          rounds: signal(opts.rounds ?? []).asReadonly(),
          participants: signal([]).asReadonly(),
          activeParticipants: signal([]).asReadonly(),
          onlineParticipantIds: signal(new Set()).asReadonly(),
          agenda: signal(opts.pendingAgenda ?? []).asReadonly(),
          pendingAgenda: signal(opts.pendingAgenda ?? []).asReadonly(),
          nextPendingAgendaItem: signal(null).asReadonly(),
          commands,
          endSessionForEveryone,
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
      { provide: ToastService, useValue: { show: vi.fn(), error: toastError } },
      { provide: ExportService, useValue: { export: vi.fn() } },
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
    alerts,
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

describe('LobbyPage — leaveSession', () => {
  it('writes the soft-delete, flushes, tears down, and drops the cached entry', async () => {
    const leave = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, teardown, flushUpdates, lastSession, navigate, alerts, haptic } =
      await mountForCommands({ roomUuid: 'uuid-1', commands: { leave } });

    await page.confirmLeave();
    tapAlertButton(alerts, 'Leave');
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(haptic.impactHeavy).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(flushUpdates).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(lastSession.removeByUuid).toHaveBeenCalledWith('uuid-1');
    expect(lastSession.clearAll).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/home']);
  });

  it('clears every cached entry when the doc carries no roomUuid', async () => {
    const { page, lastSession, navigate, alerts } = await mountForCommands({
      commands: { leave: vi.fn().mockReturnValue(APPLIED_ROSTER) },
    });

    await page.confirmLeave();
    tapAlertButton(alerts, 'Leave');
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(lastSession.clearAll).toHaveBeenCalledTimes(1);
    expect(lastSession.removeByUuid).not.toHaveBeenCalled();
  });

  it('skips the soft-delete and the flush when there is no participant id', async () => {
    const leave = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, teardown, flushUpdates, navigate, alerts } = await mountForCommands({
      myId: null,
      commands: { leave },
    });

    await page.confirmLeave();
    tapAlertButton(alerts, 'Leave');
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(leave).not.toHaveBeenCalled();
    expect(flushUpdates).not.toHaveBeenCalled();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

describe('LobbyPage — onHandoffTap', () => {
  it('fires a medium haptic when the handoff applies', async () => {
    const handoffHost = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, haptic, alerts } = await mountForCommands({ commands: { handoffHost } });

    await page.onHandoffTap('them', 'Ada');
    tapAlertButton(alerts, 'Confirm');

    expect(handoffHost).toHaveBeenCalledWith('them');
    expect(haptic.impactMedium).toHaveBeenCalledTimes(1);
  });

  it('fires no haptic when the target is offline and the command refuses', async () => {
    const handoffHost = vi
      .fn()
      .mockReturnValue({ applied: false, reason: 'not-online' } satisfies RosterResult);
    const { page, haptic, alerts } = await mountForCommands({ commands: { handoffHost } });

    await page.onHandoffTap('them', 'Ada');
    tapAlertButton(alerts, 'Confirm');

    expect(haptic.impactMedium).not.toHaveBeenCalled();
  });

  it('does not reach the command before the participant id exists', async () => {
    const handoffHost = vi.fn().mockReturnValue(APPLIED_ROSTER);
    const { page, alerts } = await mountForCommands({ myId: null, commands: { handoffHost } });

    await page.onHandoffTap('them', 'Ada');
    tapAlertButton(alerts, 'Confirm');

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

describe('LobbyPage — WS rejection while on Lobby', () => {
  it('tears the session down, toasts, and routes back to Join on wrong-password', async () => {
    const lastRejection = signal<JoinRejectionReason | null>(null);
    const { fixture, teardown, toastError, navigate } = await mountForCommands({ lastRejection });
    fixture.detectChanges();

    lastRejection.set('wrong-password');
    fixture.detectChanges();

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/join'], { queryParams: { code: 'ABC123' } });
  });

  it('routes Home for a rejection that is not a password mismatch', async () => {
    const lastRejection = signal<JoinRejectionReason | null>(null);
    const { fixture, teardown, navigate } = await mountForCommands({ lastRejection });
    fixture.detectChanges();

    lastRejection.set('room-full');
    fixture.detectChanges();

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/home']);
  });
});
