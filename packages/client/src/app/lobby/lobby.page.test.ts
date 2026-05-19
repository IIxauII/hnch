/**
 * Unit tests for the LobbyPage role predicate and the subtitle computed
 * (custom-scale label resolution). The chip-color and chip-label
 * expressions live inline in the template — those remain e2e-covered.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import type { CustomScale, ParticipantSnapshot, Round, Scale } from '@hnch/shared';

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
  logOutOutline: '',
  pencilOutline: '',
  personCircleOutline: '',
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
          lastRejection: signal(null).asReadonly(),
          rounds: signal([]).asReadonly(),
          participants: signal([]).asReadonly(),
          activeParticipants: signal([]).asReadonly(),
          onlineParticipantIds: signal(new Set()).asReadonly(),
          agenda: signal([]).asReadonly(),
          pendingAgenda: signal([]).asReadonly(),
          nextPendingAgendaItem: signal(null).asReadonly(),
          endSession: vi.fn(),
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
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            startRound,
            endSession: vi.fn(),
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
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            endSession: vi.fn(),
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
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            endSession: vi.fn(),
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
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            activeParticipants: signal([]).asReadonly(),
            onlineParticipantIds: signal(new Set()).asReadonly(),
            agenda: signal([]).asReadonly(),
            pendingAgenda: signal([]).asReadonly(),
            nextPendingAgendaItem: signal(null).asReadonly(),
            endSession: vi.fn(),
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
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            onlineIds: signal(new Set()).asReadonly(),
            endSession: vi.fn(),
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
            lastRejection: signal(null).asReadonly(),
            rounds: signal([]).asReadonly(),
            participants: signal([]).asReadonly(),
            onlineIds: signal(new Set()).asReadonly(),
            endSession: vi.fn(),
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
