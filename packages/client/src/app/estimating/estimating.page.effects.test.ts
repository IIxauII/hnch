/**
 * Unit tests covering the status-based conditionals / effects added in the
 * refactor/round-status-projection branch — lines flagged by codecov/patch.
 *
 * Covers:
 *  - autoNav effect: wiring only — the screen signal drives the navigation.
 *    The rule itself lives in the shared `screenFor` selector and is tested
 *    there against plain projections (issue #508).
 *  - showBackChevron computed: non-host + terminal round → true
 *  - backChevronLabel computed: host + active round → discard label
 *  - keyboard-gate roundActive: host + active round passes gate
 *  - softExit: host → routes through discardCurrentRound command; non-host → does not
 *  - openActionSheet: host + active round → inserts 'Skip round' item
 */

import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { canEnterTerminal, type Round, type Screen } from '@hnch/shared';

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
  /**
   * Initial `DocService.screen` value. Defaults to the screen the initial
   * round implies; pass `null` explicitly to stand in for a page that mounted
   * before the projection arrived.
   */
  initialScreen?: Screen | null;
  /** Initial rounds array. */
  initialRounds?: Round[];
  /** Whether 'me' is the host. */
  isHost?: boolean;
  /** Roster (defaults to a single active 'me'). */
  participants?: { id: string; joinedAt?: number }[];
  /** Online participant ids. */
  onlineIds?: Set<string>;
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
  // `DocService.screen` mirrors the shared `screenFor()` selector, plus the
  // pre-load `null`. The page reads it and nothing else to decide routing.
  const screenSig = signal<Screen | null>(
    opts.initialScreen !== undefined
      ? opts.initialScreen
      : round && canEnterTerminal(round.status)
        ? 'estimating'
        : 'lobby',
  );
  // The driver is session-scoped in DocService now; the page only watches
  // this counter. Tests bump it to stand in for an auto-reveal landing.
  const autoRevealCountSig = signal(0);
  const navigate = vi.fn().mockResolvedValue(true);
  // Terminal commands return a TerminalResult; the page branches on `applied`.
  // Default to applied:true (active round); tests override to simulate no-ops.
  const discardCurrentRound = vi.fn().mockReturnValue({ applied: true, at: 1 });
  const revealCurrentRound = vi.fn().mockReturnValue({ applied: true, at: 1 });
  const skipCurrentRound = vi.fn().mockReturnValue({ applied: true, at: 1 });
  const openSheetOrPopover = vi.fn().mockResolvedValue(undefined);
  const haptic = {
    impactLight: vi.fn(),
    impactMedium: vi.fn(),
    impactHeavy: vi.fn(),
    notificationSuccess: vi.fn(),
  };

  const hostId = opts.isHost === false ? 'other-host' : 'me';
  const roster = opts.participants ?? [{ id: 'me', joinedAt: 0 }];
  const onlineIds = opts.onlineIds ?? new Set<string>();

  // activeRound mirrors the shared `activeRound()` projection: the round
  // when it's still pending/voting, else null — no anchor fallback.
  const activeRoundSig = computed(() => {
    const r = currentRoundSig();
    return r && canEnterTerminal(r.status) ? r : null;
  });

  const docService = {
    currentRound: currentRoundSig.asReadonly(),
    activeRound: activeRoundSig,
    screen: screenSig.asReadonly(),
    rounds: roundsSig.asReadonly(),
    onlineParticipants: signal([]).asReadonly(),
    onlineParticipantIds: signal(onlineIds).asReadonly(),
    participants: signal(roster).asReadonly(),
    activeParticipants: signal(roster).asReadonly(),
    settings: signal({ hostParticipantId: hostId }).asReadonly(),
    roomCode: signal('ZZZZZZ').asReadonly(),
    meta: signal({ roomUuid: 'uuid' }).asReadonly(),
    syncStatus: signal('idle').asReadonly(),
    autoRevealCount: autoRevealCountSig.asReadonly(),
    toggleCurrentVote: vi.fn().mockReturnValue({ applied: true, effect: 'cast' }),
    clearCurrentVote: vi.fn().mockReturnValue({ applied: true, effect: 'cleared' }),
    revealCurrentRound,
    skipCurrentRound,
    discardCurrentRound,
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
      { provide: HapticService, useValue: haptic },
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
    revealCurrentRound,
    skipCurrentRound,
    discardCurrentRound,
    openSheetOrPopover,
    haptic,
    currentRoundSig,
    roundsSig,
    screenSig,
    autoRevealCountSig,
  };
}

// ---------------------------------------------------------------------------
// autoNav effect
// ---------------------------------------------------------------------------

describe('EstimatingPage — autoNav effect (wiring)', () => {
  beforeEach(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  it('does NOT navigate while the screen is estimating', async () => {
    const { navigate } = await mount({ initialScreen: 'estimating' });
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates to lobby, replacing the URL, when the screen flips to lobby', async () => {
    const { navigate, screenSig } = await mount({ initialScreen: 'estimating' });
    TestBed.flushEffects();
    screenSig.set('lobby');
    TestBed.flushEffects();
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ'], { replaceUrl: true });
  });

  // The pre-load guard. The selector structurally cannot catch a missing one:
  // a page admitted by the session-resume guard's timeout path mounts with no
  // projection, and treating that as "no active round" would silently bounce
  // every slow-connection peer to Lobby.
  it('does NOT navigate while the screen is null (projection not yet loaded)', async () => {
    const { navigate } = await mount({ initialScreen: null, initialRound: null });
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates once the screen resolves to lobby after a null pre-load', async () => {
    const { navigate, screenSig } = await mount({ initialScreen: null, initialRound: null });
    TestBed.flushEffects();
    expect(navigate).not.toHaveBeenCalled();
    screenSig.set('lobby');
    TestBed.flushEffects();
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ'], { replaceUrl: true });
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
    const ds = TestBed.inject(DocService) as unknown as {
      toggleCurrentVote: ReturnType<typeof vi.fn>;
    };
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1',
      code: 'Digit1',
    });
    document.dispatchEvent(event);
    expect(ds.toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('passes gate and casts vote when host + active (voting) round', async () => {
    await mount({ isHost: true, initialRound: votingRound() });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as {
      toggleCurrentVote: ReturnType<typeof vi.fn>;
    };
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1',
      code: 'Digit1',
    });
    document.dispatchEvent(event);
    expect(ds.toggleCurrentVote).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// softExit — wiring only. The terminal-legality gate now lives in the shared
// `discardCurrentRound` command (covered in round-commands.test.ts); the page
// delegates to it whenever the user is host, then navigates regardless.
// ---------------------------------------------------------------------------

describe('EstimatingPage — softExit', () => {
  type Internals = { softExit(): void };

  it('host → routes through discardCurrentRound then navigates', async () => {
    const { fixture, discardCurrentRound, navigate } = await mount({
      isHost: true,
      initialRound: votingRound('r-active'),
    });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardCurrentRound).toHaveBeenCalledWith('me');
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ']);
  });

  it('host + command no-ops (already-terminal) → still navigates', async () => {
    const { fixture, discardCurrentRound, navigate } = await mount({
      isHost: true,
      initialRound: terminalRound('revealed', 'r-done'),
    });
    discardCurrentRound.mockReturnValue({ applied: false, reason: 'already-terminal' });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardCurrentRound).toHaveBeenCalledWith('me');
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ']);
  });

  it('non-host → does NOT call discardCurrentRound', async () => {
    const { fixture, discardCurrentRound } = await mount({
      isHost: false,
      initialRound: votingRound(),
    });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardCurrentRound).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// onReveal — routes through revealCurrentRound; haptics + navigates on applied
// ---------------------------------------------------------------------------

describe('EstimatingPage — onReveal', () => {
  type Internals = { onReveal(): Promise<void> };

  it('applied → haptics and navigates to lobby', async () => {
    const { fixture, revealCurrentRound, haptic, navigate } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    await (fixture.componentInstance as unknown as Internals).onReveal();
    expect(revealCurrentRound).toHaveBeenCalled();
    expect(haptic.impactMedium).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ'], { replaceUrl: true });
  });

  it('no-op (not applied) → no haptic, no navigate', async () => {
    const { fixture, revealCurrentRound, haptic, navigate } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    revealCurrentRound.mockReturnValue({ applied: false, reason: 'already-terminal' });
    await (fixture.componentInstance as unknown as Internals).onReveal();
    expect(haptic.impactMedium).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Skip-round action handler — routes through skipCurrentRound; haptics on applied
// ---------------------------------------------------------------------------

describe('EstimatingPage — skip-round action', () => {
  type Internals = { openActionSheet(e: Event): Promise<void> };

  it('invokes skipCurrentRound and haptics on applied', async () => {
    const { fixture, skipCurrentRound, haptic, openSheetOrPopover } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    await (fixture.componentInstance as unknown as Internals).openActionSheet(new Event('click'));
    const [opts] = openSheetOrPopover.mock.calls[0] as [
      { items: { text: string; handler?: () => void }[] },
    ];
    opts.items.find((i) => i.text === 'Skip round')?.handler?.();
    expect(skipCurrentRound).toHaveBeenCalled();
    expect(haptic.impactHeavy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// auto-reveal feedback effect — the rule and its driver are session-scoped in
// DocService (shared `startAutoReveal`); this page only fires the haptic off
// the counter the driver bumps. Rule coverage: shared/src/auto-reveal.test.ts;
// wiring coverage: core/doc/doc.service.auto-reveal.test.ts.
// ---------------------------------------------------------------------------

describe('EstimatingPage — auto-reveal feedback effect', () => {
  it('counter bump → success haptic', async () => {
    const { haptic, autoRevealCountSig } = await mount({ initialRound: votingRound() });
    TestBed.flushEffects();
    expect(haptic.notificationSuccess).not.toHaveBeenCalled();

    autoRevealCountSig.set(1);
    TestBed.flushEffects();

    expect(haptic.notificationSuccess).toHaveBeenCalledOnce();
  });

  it('the page never drives the reveal itself', async () => {
    const round: Round = { ...votingRound(), votes: { me: '5' } };
    const { revealCurrentRound } = await mount({
      initialRound: round,
      participants: [{ id: 'me', joinedAt: 0 }],
      onlineIds: new Set(['me']),
    });
    TestBed.flushEffects();

    // Unanimous by the shared predicate — but the page holds no copy of the
    // rule, so mounting it must not write anything.
    expect(revealCurrentRound).not.toHaveBeenCalled();
  });

  it('mounting after an earlier auto-reveal does not re-fire the haptic', async () => {
    // A peer that navigates into Estimating mid-session inherits a non-zero
    // counter; the effect's initial run must be inert.
    const { haptic, autoRevealCountSig } = await mount({ initialRound: votingRound() });
    autoRevealCountSig.set(3);
    TestBed.flushEffects();
    haptic.notificationSuccess.mockClear();

    TestBed.flushEffects();

    expect(haptic.notificationSuccess).not.toHaveBeenCalled();
  });

  it('no bump → no haptic', async () => {
    const { haptic } = await mount({ initialRound: votingRound() });
    TestBed.flushEffects();
    expect(haptic.notificationSuccess).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// card grid / abstain-button visibility — mirrors the `@else if (activeRound();
// as activeR)` branch. Success criterion: the card grid is gone as soon as
// the round is terminal, with no interactive frame in between.
// ---------------------------------------------------------------------------

describe('EstimatingPage — card grid visibility follows activeRound', () => {
  it('active (voting) round → card grid and abstain button are rendered', async () => {
    const { fixture } = await mount({ initialRound: votingRound() });
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.card');
    const abstainBtn = fixture.nativeElement.querySelector('.abstain-btn');
    expect(cards.length).toBe(votingRound().scale.cards.length);
    expect(abstainBtn).not.toBeNull();
  });

  it('terminal (skipped) round → no card elements and no abstain button', async () => {
    const { fixture } = await mount({ initialRound: terminalRound('skipped') });
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.card');
    const abstainBtn = fixture.nativeElement.querySelector('.abstain-btn');
    expect(cards.length).toBe(0);
    expect(abstainBtn).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// onCardTap / onAbstain — applied:false suppresses the haptic (mirrors the
// keydown-gate coverage in estimating.page.keyboard.test.ts).
// ---------------------------------------------------------------------------

describe('EstimatingPage — vote-command applied:false suppresses haptics', () => {
  type CardTapInternals = { onCardTap(card: string): void };
  type AbstainInternals = { onAbstain(): void };

  it('onCardTap: applied:false (not-a-voter) → no haptic', async () => {
    const { fixture, haptic } = await mount({ initialRound: votingRound() });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as {
      toggleCurrentVote: ReturnType<typeof vi.fn>;
    };
    ds.toggleCurrentVote.mockReturnValue({ applied: false, reason: 'not-a-voter' });
    (fixture.componentInstance as unknown as CardTapInternals).onCardTap('1');
    expect(haptic.impactLight).not.toHaveBeenCalled();
  });

  it('onAbstain: applied:false (not-a-voter) → no haptic', async () => {
    const { fixture, haptic } = await mount({ initialRound: votingRound() });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as {
      toggleCurrentVote: ReturnType<typeof vi.fn>;
    };
    ds.toggleCurrentVote.mockReturnValue({ applied: false, reason: 'not-a-voter' });
    (fixture.componentInstance as unknown as AbstainInternals).onAbstain();
    expect(haptic.impactLight).not.toHaveBeenCalled();
  });
});
