/**
 * Unit tests covering the status-based conditionals / effects added in the
 * refactor/round-status-projection branch — lines flagged by codecov/patch.
 *
 * Covers:
 *  - autoNav effect: terminal round → router.navigate to lobby
 *  - discardRecovery effect: entry round transitions to 'discarded' → navigate
 *  - showBackChevron computed: non-host + terminal round → true
 *  - backChevronLabel computed: host + active round → discard label
 *  - keyboard-gate roundActive: host + active round passes gate
 *  - softExit: host + active round → calls discardRound; non-active → does not
 *  - openActionSheet: host + active round → inserts 'Skip round' item
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Round } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});
  return {
    IonAccordion: stub('ion-accordion'),
    IonAccordionGroup: stub('ion-accordion-group'),
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonCard: stub('ion-card'),
    IonCardContent: stub('ion-card-content'),
    IonChip: stub('ion-chip'),
    IonCol: stub('ion-col'),
    IonContent: stub('ion-content'),
    IonFooter: stub('ion-footer'),
    IonGrid: stub('ion-grid'),
    IonHeader: stub('ion-header'),
    IonIcon: stub('ion-icon'),
    IonItem: stub('ion-item'),
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonRow: stub('ion-row'),
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
    IonNote: stub('ion-note'),
    IonModal: stub('ion-modal'),
    AlertController: class AlertController {
      create = vi.fn().mockResolvedValue({ present: vi.fn() });
    },
    ActionSheetController: class ActionSheetController {},
    ModalController: class ModalController {},
    PopoverController: class PopoverController {},
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({
  checkmarkCircle: '',
  chevronBackOutline: '',
  closeCircleOutline: '',
  ellipsisHorizontalCircle: '',
  logOutOutline: '',
  removeCircleOutline: '',
  settingsOutline: '',
}));
vi.mock('../core/connection-chip.component', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-connection-chip', template: '', standalone: true })
  class ConnectionChipComponent {}
  return { ConnectionChipComponent };
});
vi.mock('../shared/connection-status-banner.component', async () => {
  const { Component } = await import('@angular/core');
  @Component({ selector: 'app-connection-status-banner', template: '', standalone: true })
  class ConnectionStatusBannerComponent {}
  return { ConnectionStatusBannerComponent };
});
vi.mock('./avatar-vote-row.component', async () => {
  const { Component, input } = await import('@angular/core');
  @Component({ selector: 'app-avatar-vote-row', template: '', standalone: true })
  class AvatarVoteRowComponent {
    readonly participants = input<unknown[]>([]);
    readonly votedIds = input<ReadonlySet<string>>(new Set<string>());
  }
  return { AvatarVoteRowComponent };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function votingRound(id = 'r1'): Round {
  return {
    id,
    startedAt: 1,
    createdAt: 0,
    createdBy: 'host',
    status: 'voting',
    scale: { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] },
    votes: {},
  };
}

function terminalRound(status: 'revealed' | 'skipped' | 'discarded', id = 'r1'): Round {
  return {
    id,
    startedAt: 1,
    createdAt: 0,
    createdBy: 'host',
    status,
    terminalAt: 9999,
    scale: { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] },
    votes: {},
  };
}

// ---------------------------------------------------------------------------
// Mount helpers
// ---------------------------------------------------------------------------

interface MountOpts {
  /** Initial currentRound value. */
  initialRound?: Round | null;
  /** Initial rounds array. */
  initialRounds?: Round[];
  /** Whether 'me' is the host. */
  isHost?: boolean;
}

async function mount(opts: MountOpts = {}) {
  const { DocService } = await import('../core/doc/doc.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { HapticService } = await import('../core/haptic.service');
  const { LastSessionService } = await import('../core/last-session.service');
  const { TimerTickService } = await import('../core/timer-tick.service');
  const { SurfaceService } = await import('../core/surface.service');
  const { Router } = await import('@angular/router');
  const { AlertController } = await import('@ionic/angular/standalone');

  const round = opts.initialRound !== undefined ? opts.initialRound : votingRound();
  const rounds = opts.initialRounds ?? (round ? [round] : []);

  const currentRoundSig = signal<Round | null | undefined>(round);
  const roundsSig = signal<Round[]>(rounds);
  const navigate = vi.fn().mockResolvedValue(true);
  const discardRound = vi.fn();
  const openSheetOrPopover = vi.fn().mockResolvedValue(undefined);

  const hostId = opts.isHost === false ? 'other-host' : 'me';

  const docService = {
    currentRound: currentRoundSig.asReadonly(),
    rounds: roundsSig.asReadonly(),
    onlineParticipants: signal([]).asReadonly(),
    onlineParticipantIds: signal(new Set<string>()).asReadonly(),
    participants: signal([{ id: 'me', name: 'Me' }]).asReadonly(),
    activeParticipants: signal([{ id: 'me', name: 'Me' }]).asReadonly(),
    settings: signal({ hostParticipantId: hostId }).asReadonly(),
    roomCode: signal('ZZZZZZ').asReadonly(),
    meta: signal({ roomUuid: 'uuid' }).asReadonly(),
    syncStatus: signal('idle').asReadonly(),
    castVote: vi.fn(),
    clearVote: vi.fn(),
    revealRound: vi.fn(),
    skipRound: vi.fn(),
    discardRound,
    leaveSession: vi.fn(),
    flushUpdates: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
    endSessionForEveryone: vi.fn(),
    toggleRole: vi.fn(),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DocService, useValue: docService },
      { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
      {
        provide: HapticService,
        useValue: {
          impactLight: vi.fn(),
          impactMedium: vi.fn(),
          impactHeavy: vi.fn(),
          notificationSuccess: vi.fn(),
        },
      },
      {
        provide: LastSessionService,
        useValue: {
          record: vi.fn().mockResolvedValue(undefined),
          clear: vi.fn().mockResolvedValue(undefined),
          removeByUuid: vi.fn().mockResolvedValue(undefined),
          clearAll: vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: TimerTickService, useValue: { now: () => 0 } },
      {
        provide: SurfaceService,
        useValue: {
          mode: signal('desktop').asReadonly(),
          openSheetOrPopover,
        },
      },
      { provide: Router, useValue: { navigate } },
      {
        provide: AlertController,
        useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn() }) },
      },
    ],
  });

  const { EstimatingPage } = await import('./estimating.page');
  const fixture = TestBed.createComponent(EstimatingPage);
  fixture.detectChanges();

  return {
    fixture,
    navigate,
    discardRound,
    openSheetOrPopover,
    currentRoundSig,
    roundsSig,
  };
}

// ---------------------------------------------------------------------------
// autoNav effect
// ---------------------------------------------------------------------------

describe('EstimatingPage — autoNav effect', () => {
  beforeEach(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  it('does NOT navigate when round is null', async () => {
    const { navigate } = await mount({ initialRound: null });
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does NOT navigate when round status is voting', async () => {
    const { navigate } = await mount({ initialRound: votingRound() });
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates to lobby when round becomes revealed', async () => {
    const { navigate, currentRoundSig } = await mount({ initialRound: votingRound() });
    currentRoundSig.set(terminalRound('revealed'));
    TestBed.flushEffects();
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ'], { replaceUrl: true });
  });

  it('navigates to lobby when round becomes skipped', async () => {
    const { navigate, currentRoundSig } = await mount({ initialRound: votingRound() });
    currentRoundSig.set(terminalRound('skipped'));
    TestBed.flushEffects();
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ'], { replaceUrl: true });
  });
});

// ---------------------------------------------------------------------------
// discardRecovery effect
// ---------------------------------------------------------------------------

describe('EstimatingPage — discardRecovery effect', () => {
  beforeEach(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  it('navigates to lobby when entry round transitions to discarded in rounds array', async () => {
    const initial = votingRound('r-entry');
    const { navigate, currentRoundSig, roundsSig } = await mount({
      initialRound: initial,
      initialRounds: [initial],
    });
    TestBed.flushEffects();

    // Simulate host discarding: currentRound() returns null (discarded excluded),
    // but rounds[] still contains the discarded round.
    const discarded = terminalRound('discarded', 'r-entry');
    currentRoundSig.set(null);
    roundsSig.set([discarded]);
    TestBed.flushEffects();

    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ'], { replaceUrl: true });
  });

  it('does NOT navigate when entry round is still voting (not discarded)', async () => {
    const initial = votingRound('r-active');
    const { navigate } = await mount({
      initialRound: initial,
      initialRounds: [initial],
    });
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// showBackChevron computed
// ---------------------------------------------------------------------------

describe('EstimatingPage — showBackChevron computed', () => {
  type Internals = { showBackChevron: () => boolean };

  it('true for host regardless of round status', async () => {
    const { fixture } = await mount({ isHost: true, initialRound: votingRound() });
    const page = fixture.componentInstance as unknown as Internals;
    expect(page.showBackChevron()).toBe(true);
  });

  it('false for non-host when round is active (voting)', async () => {
    const { fixture } = await mount({ isHost: false, initialRound: votingRound() });
    const page = fixture.componentInstance as unknown as Internals;
    expect(page.showBackChevron()).toBe(false);
  });

  it('true for non-host when round is terminal (revealed)', async () => {
    const { fixture } = await mount({
      isHost: false,
      initialRound: terminalRound('revealed'),
    });
    const page = fixture.componentInstance as unknown as Internals;
    expect(page.showBackChevron()).toBe(true);
  });

  it('true for non-host when round is terminal (skipped)', async () => {
    const { fixture } = await mount({
      isHost: false,
      initialRound: terminalRound('skipped'),
    });
    const page = fixture.componentInstance as unknown as Internals;
    expect(page.showBackChevron()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// backChevronLabel computed
// ---------------------------------------------------------------------------

describe('EstimatingPage — backChevronLabel computed', () => {
  type Internals = { backChevronLabel: () => string };

  it('discard label when host + active round (pending/voting)', async () => {
    const { fixture } = await mount({ isHost: true, initialRound: votingRound() });
    const page = fixture.componentInstance as unknown as Internals;
    expect(page.backChevronLabel()).toBe('Discard round and return to lobby');
  });

  it('back label when host + terminal round', async () => {
    const { fixture } = await mount({ isHost: true, initialRound: terminalRound('revealed') });
    const page = fixture.componentInstance as unknown as Internals;
    expect(page.backChevronLabel()).toBe('Back to lobby');
  });

  it('back label when non-host + active round', async () => {
    const { fixture } = await mount({ isHost: false, initialRound: votingRound() });
    const page = fixture.componentInstance as unknown as Internals;
    expect(page.backChevronLabel()).toBe('Back to lobby');
  });
});

// ---------------------------------------------------------------------------
// keyboard-gate roundActive (via shouldHandleKeyEvent)
// ---------------------------------------------------------------------------

describe('EstimatingPage — keyboard gate: roundActive', () => {
  it('skips vote when round is terminal (revealed)', async () => {
    await mount({ isHost: true, initialRound: terminalRound('revealed') });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as { castVote: ReturnType<typeof vi.fn> };
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1',
      code: 'Digit1',
    });
    document.dispatchEvent(event);
    expect(ds.castVote).not.toHaveBeenCalled();
  });

  it('passes gate and casts vote when host + active (voting) round', async () => {
    await mount({ isHost: true, initialRound: votingRound() });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as { castVote: ReturnType<typeof vi.fn> };
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1',
      code: 'Digit1',
    });
    document.dispatchEvent(event);
    expect(ds.castVote).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// softExit — host + active round → discardRound; host + terminal → no discard
// ---------------------------------------------------------------------------

describe('EstimatingPage — softExit', () => {
  type Internals = { softExit(): void };

  it('host + active round → calls discardRound then navigates', async () => {
    const { fixture, discardRound, navigate } = await mount({
      isHost: true,
      initialRound: votingRound('r-active'),
    });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardRound).toHaveBeenCalledWith('r-active', 'me');
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ']);
  });

  it('host + terminal round → does NOT call discardRound', async () => {
    const { fixture, discardRound, navigate } = await mount({
      isHost: true,
      initialRound: terminalRound('revealed', 'r-done'),
    });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardRound).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ']);
  });

  it('non-host → does NOT call discardRound', async () => {
    const { fixture, discardRound } = await mount({
      isHost: false,
      initialRound: votingRound(),
    });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardRound).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// openActionSheet — host + active round → inserts Skip round item
// ---------------------------------------------------------------------------

describe('EstimatingPage — openActionSheet skip-round insertion', () => {
  type Internals = { openActionSheet(e: Event): Promise<void> };

  it('host + active round → includes "Skip round" item in action sheet', async () => {
    const { fixture, openSheetOrPopover } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    const page = fixture.componentInstance as unknown as Internals;
    await page.openActionSheet(new Event('click'));

    expect(openSheetOrPopover).toHaveBeenCalledTimes(1);
    const [opts] = openSheetOrPopover.mock.calls[0] as [{ items: { text: string }[] }];
    const texts = opts.items.map((i) => i.text);
    expect(texts).toContain('Skip round');
  });

  it('host + terminal round → does NOT include "Skip round"', async () => {
    const { fixture, openSheetOrPopover } = await mount({
      isHost: true,
      initialRound: terminalRound('revealed'),
    });
    const page = fixture.componentInstance as unknown as Internals;
    await page.openActionSheet(new Event('click'));

    const [opts] = openSheetOrPopover.mock.calls[0] as [{ items: { text: string }[] }];
    const texts = opts.items.map((i) => i.text);
    expect(texts).not.toContain('Skip round');
  });

  it('non-host → does NOT include "Skip round"', async () => {
    const { fixture, openSheetOrPopover } = await mount({
      isHost: false,
      initialRound: votingRound(),
    });
    const page = fixture.componentInstance as unknown as Internals;
    await page.openActionSheet(new Event('click'));

    const [opts] = openSheetOrPopover.mock.calls[0] as [{ items: { text: string }[] }];
    const texts = opts.items.map((i) => i.text);
    expect(texts).not.toContain('Skip round');
  });
});
