/**
 * Unit tests covering the status-based conditionals / effects added in the
 * refactor/round-status-projection branch — lines flagged by codecov/patch.
 *
 * Covers:
 *  - autoNav effect: wiring only — the screen signal drives the navigation.
 *    The rule itself lives in the shared `screenFor` selector and is tested
 *    there against plain projections (#508).
 *  - showBackChevron computed: non-host + terminal round → true
 *  - backChevronLabel computed: host + active round → cancel label
 *  - keyboard-gate roundActive: host + active round passes gate
 *  - softExit: host → routes through discardCurrentRound command; non-host → does not
 *  - openActionSheet: host + active round → inserts 'Skip round' item
 *  - cancelled round: the host is told at the tap, everyone else on the way out
 *  - host / joiner split of the toolbar and the footer
 */

import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { canEnterTerminal, UNBOUND_SESSION_COMMANDS, type Round, type Screen } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});
  return {
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonCard: stub('ion-card'),
    IonCardContent: stub('ion-card-content'),
    IonChip: stub('ion-chip'),
    IonContent: stub('ion-content'),
    IonFooter: stub('ion-footer'),
    IonHeader: stub('ion-header'),
    IonIcon: stub('ion-icon'),
    IonLabel: stub('ion-label'),
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
    // Reached through SurfaceService → MenuPopoverComponent.
    IonItem: stub('ion-item'),
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    AlertController: class AlertController {
      create = vi.fn().mockResolvedValue({ present: vi.fn() });
    },
    ActionSheetController: class ActionSheetController {},
    ModalController: class ModalController {},
    PopoverController: class PopoverController {},
    ToastController: class ToastController {},
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({
  checkmarkCircle: '',
  chevronBackOutline: '',
  close: '',
  closeCircleOutline: '',
  ellipsisHorizontal: '',
  eyeOutline: '',
  logOutOutline: '',
  playSkipForwardOutline: '',
  removeCircleOutline: '',
  timerOutline: '',
}));
vi.mock('../shared/role-toggle.component', async () => {
  const { Component, input, output } = await import('@angular/core');
  @Component({ selector: 'app-role-toggle', template: '', standalone: true })
  class RoleToggleComponent {
    readonly viewer = input<boolean>(false);
    readonly toggled = output<void>();
  }
  return { RoleToggleComponent };
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

// Fixtures

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

// Mount helpers

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
  /** Own participant id; `null` stands in for a page mounted before it exists. */
  myId?: string | null;
  /** Alerts take until `alertsReady()` to be made, as they take a moment in the app. */
  holdAlerts?: boolean;
}

async function mount(opts: MountOpts = {}) {
  const { DocService } = await import('../core/doc/doc.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { HapticService } = await import('../core/haptic.service');
  const { LastSessionService } = await import('../core/last-session.service');
  const { SessionExitService } = await import('../core/session-exit.service');
  const { TimerTickService } = await import('../core/timer-tick.service');
  const { SurfaceService } = await import('../core/surface.service');
  const { Router } = await import('@angular/router');
  const { ToastService } = await import('../services/toast.service');
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
  const dismissMenu = vi.fn().mockResolvedValue(undefined);
  const dismissAlert = vi.fn().mockResolvedValue(true);
  const presentAlert = vi.fn().mockResolvedValue(undefined);
  const removeAlert = vi.fn();
  let alertsReady!: () => void;
  const alertsHeld = opts.holdAlerts
    ? new Promise<void>((resolve) => {
        alertsReady = resolve;
      })
    : Promise.resolve();
  const toastInfo = vi.fn().mockResolvedValue(undefined);
  const haptic = {
    impactLight: vi.fn(),
    impactMedium: vi.fn(),
    impactHeavy: vi.fn(),
    notificationSuccess: vi.fn(),
  };

  // Alert configs the page hands to AlertController, so a test can run the
  // handler on a named button without rendering the dialog.
  const alerts: {
    header?: string;
    buttons: { text: string; role?: string; handler?: () => void }[];
  }[] = [];
  const lastSession = {
    record: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    removeByUuid: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
  };
  const sessionExit = { exit: vi.fn().mockResolvedValue(undefined) };
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
    onlineParticipantIds: signal(onlineIds).asReadonly(),
    participants: signal(roster).asReadonly(),
    activeParticipants: signal(roster).asReadonly(),
    settings: signal({ hostParticipantId: hostId }).asReadonly(),
    roomCode: signal('ZZZZZZ').asReadonly(),
    meta: signal({ roomUuid: 'uuid-from-the-doc' }).asReadonly(),
    syncStatus: signal('idle').asReadonly(),
    relaySynced: signal(false).asReadonly(),
    joined: signal(false).asReadonly(),
    relayRoomUuid: signal<string | null>('uuid').asReadonly(),
    autoRevealCount: autoRevealCountSig.asReadonly(),
    commands: {
      ...UNBOUND_SESSION_COMMANDS,
      toggleCurrentVote: vi.fn().mockReturnValue({ applied: true, effect: 'cast' }),
      clearCurrentVote: vi.fn().mockReturnValue({ applied: true, effect: 'cleared' }),
      revealCurrentRound,
      skipCurrentRound,
      discardCurrentRound,
      leave: vi.fn(),
      toggleRole: vi.fn(),
    },
    flushUpdates: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn(),
    endSessionForEveryone: vi.fn(),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DocService, useValue: docService },
      {
        provide: ParticipantIdService,
        useValue: { id: signal(opts.myId === undefined ? 'me' : opts.myId).asReadonly() },
      },
      { provide: HapticService, useValue: haptic },
      { provide: LastSessionService, useValue: lastSession },
      { provide: SessionExitService, useValue: sessionExit },
      { provide: TimerTickService, useValue: { now: () => 0 } },
      {
        provide: SurfaceService,
        useValue: {
          mode: signal('desktop').asReadonly(),
          openSheetOrPopover,
          dismissMenu,
        },
      },
      { provide: Router, useValue: { navigate } },
      { provide: ToastService, useValue: { info: toastInfo, error: vi.fn() } },
      {
        provide: AlertController,
        useValue: {
          create: vi.fn().mockImplementation(async (cfg: (typeof alerts)[number]) => {
            alerts.push(cfg);
            await alertsHeld;
            return {
              present: presentAlert,
              dismiss: dismissAlert,
              remove: removeAlert,
              // Stays up until someone answers it.
              onDidDismiss: () => new Promise(() => {}),
            };
          }),
        },
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
    dismissMenu,
    dismissAlert,
    presentAlert,
    removeAlert,
    alertsReady: () => alertsReady(),
    toastInfo,
    haptic,
    docService,
    lastSession,
    sessionExit,
    alerts,
    currentRoundSig,
    roundsSig,
    screenSig,
    autoRevealCountSig,
  };
}

// autoNav effect

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

// showBackChevron computed

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

// backChevronLabel computed

describe('EstimatingPage — backChevronLabel computed', () => {
  type Internals = { backChevronLabel: () => string };

  it('cancel label when host + active round (pending/voting)', async () => {
    const { fixture } = await mount({ isHost: true, initialRound: votingRound() });
    const page = fixture.componentInstance as unknown as Internals;
    expect(page.backChevronLabel()).toBe('Cancel round and go back to the lobby');
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

// keyboard-gate roundActive (via shouldHandleKeyEvent)

describe('EstimatingPage — keyboard gate: roundActive', () => {
  it('skips vote when round is terminal (revealed)', async () => {
    await mount({ isHost: true, initialRound: terminalRound('revealed') });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as {
      commands: { toggleCurrentVote: ReturnType<typeof vi.fn> };
    };
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1',
      code: 'Digit1',
    });
    document.dispatchEvent(event);
    expect(ds.commands.toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('passes gate and casts vote when host + active (voting) round', async () => {
    await mount({ isHost: true, initialRound: votingRound() });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as {
      commands: { toggleCurrentVote: ReturnType<typeof vi.fn> };
    };
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1',
      code: 'Digit1',
    });
    document.dispatchEvent(event);
    expect(ds.commands.toggleCurrentVote).toHaveBeenCalled();
  });
});

// softExit — wiring only. The terminal-legality gate now lives in the shared
// `discardCurrentRound` command (covered in round-commands.test.ts); the page
// delegates to it whenever the user is host, then navigates regardless.

describe('EstimatingPage — softExit', () => {
  type Internals = { softExit(): void };

  it('host → routes through discardCurrentRound then navigates', async () => {
    const { fixture, discardCurrentRound, navigate } = await mount({
      isHost: true,
      initialRound: votingRound('r-active'),
    });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardCurrentRound).toHaveBeenCalledWith();
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ']);
  });

  // The chevron cancels the round for everyone (ADR-0046) and leaves nothing
  // behind on the Lobby, so it has to say what it just did.
  it('host → says the round was cancelled', async () => {
    const { fixture, toastInfo } = await mount({
      isHost: true,
      initialRound: votingRound('r-active'),
    });
    (fixture.componentInstance as unknown as Internals).softExit();
    expect(toastInfo).toHaveBeenCalledWith('Round cancelled');
  });

  it('host + command no-ops (already-terminal) → still navigates', async () => {
    const { fixture, discardCurrentRound, navigate, toastInfo } = await mount({
      isHost: true,
      initialRound: terminalRound('revealed', 'r-done'),
    });
    discardCurrentRound.mockReturnValue({ applied: false, reason: 'already-terminal' });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardCurrentRound).toHaveBeenCalledWith();
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ']);
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('non-host → does NOT call discardCurrentRound', async () => {
    const { fixture, discardCurrentRound, toastInfo } = await mount({
      isHost: false,
      initialRound: votingRound(),
    });
    const page = fixture.componentInstance as unknown as Internals;
    page.softExit();
    expect(discardCurrentRound).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
  });
});

// Cancelled round, seen from everyone else. The page is sent back to the
// Lobby by the autoNav effect whatever ended the round; only a cancelled one
// leaves no trace there, so only that one is announced.

describe('EstimatingPage — a round that ends under a voter', () => {
  async function mountVoting(isHost: boolean) {
    const mounted = await mount({ isHost, initialRound: votingRound('r1') });
    TestBed.flushEffects();
    return mounted;
  }

  function endRound(
    mounted: Awaited<ReturnType<typeof mountVoting>>,
    status: 'revealed' | 'skipped' | 'discarded',
  ): void {
    const ended = terminalRound(status, 'r1');
    mounted.roundsSig.set([ended]);
    mounted.currentRoundSig.set(status === 'discarded' ? null : ended);
    mounted.screenSig.set('lobby');
    TestBed.flushEffects();
  }

  it('cancelled by the host → says so, then goes to the lobby', async () => {
    const mounted = await mountVoting(false);
    endRound(mounted, 'discarded');
    expect(mounted.toastInfo).toHaveBeenCalledWith('The host cancelled the round');
    expect(mounted.navigate).toHaveBeenCalledWith(['/lobby', 'ZZZZZZ'], { replaceUrl: true });
  });

  it('revealed → no toast: the results are the announcement', async () => {
    const mounted = await mountVoting(false);
    endRound(mounted, 'revealed');
    expect(mounted.toastInfo).not.toHaveBeenCalled();
    expect(mounted.navigate).toHaveBeenCalled();
  });

  it('skipped → no toast: the lobby shows "Round skipped"', async () => {
    const mounted = await mountVoting(false);
    endRound(mounted, 'skipped');
    expect(mounted.toastInfo).not.toHaveBeenCalled();
  });

  it('the host is not told twice: the tap already said it', async () => {
    const mounted = await mountVoting(true);
    endRound(mounted, 'discarded');
    expect(mounted.toastInfo).not.toHaveBeenCalled();
  });

  it('no round was ever shown → nothing to announce', async () => {
    const mounted = await mount({ isHost: false, initialScreen: null, initialRound: null });
    TestBed.flushEffects();
    mounted.roundsSig.set([terminalRound('discarded', 'r0')]);
    mounted.screenSig.set('lobby');
    TestBed.flushEffects();
    expect(mounted.toastInfo).not.toHaveBeenCalled();
  });
});

// openActionSheet — host + active round → inserts Skip round item

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

  // The button is not rendered for them; this is the handler refusing too.
  it('non-host → no menu at all', async () => {
    const { fixture, openSheetOrPopover } = await mount({
      isHost: false,
      initialRound: votingRound(),
    });
    const page = fixture.componentInstance as unknown as Internals;
    await page.openActionSheet(new Event('click'));

    expect(openSheetOrPopover).not.toHaveBeenCalled();
  });

  it('host + active round → skip, end, leave, cancel, in that order', async () => {
    const { fixture, openSheetOrPopover } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    const event = new Event('click');
    await (fixture.componentInstance as unknown as Internals).openActionSheet(event);

    const [opts] = openSheetOrPopover.mock.calls[0] as [
      { header?: string; triggerEvent: Event; items: { text: string; role?: string }[] },
    ];
    expect(opts.items.map((i) => i.text)).toEqual([
      'Skip round',
      'End session for everyone',
      'Leave session',
      'Cancel',
    ]);
    expect(opts.items.map((i) => i.role)).toEqual([
      undefined,
      'destructive',
      'destructive',
      'cancel',
    ]);
    expect(opts.triggerEvent).toBe(event);
  });

  // It used to navigate to the Lobby mid-round, where the Lobby sent the user
  // straight back — or, when it did not, stranded them away from the vote.
  it('never offers "Session settings": they live on the Lobby', async () => {
    const { fixture, openSheetOrPopover } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    await (fixture.componentInstance as unknown as Internals).openActionSheet(new Event('click'));

    const [opts] = openSheetOrPopover.mock.calls[0] as [{ items: { text: string }[] }];
    expect(opts.items.map((i) => i.text)).not.toContain('Session settings');
  });
});

// Host / joiner split of the template

describe('EstimatingPage — toolbar and footer', () => {
  function textOf(el: Element | null | undefined): string {
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('is titled with the round number', async () => {
    const { fixture } = await mount({
      initialRound: votingRound('r2'),
      initialRounds: [terminalRound('revealed', 'r1'), votingRound('r2')],
    });
    expect(textOf(fixture.nativeElement.querySelector('ion-title'))).toBe('Round 2');
  });

  it('is titled "Estimating" until the round shows up', async () => {
    const { fixture } = await mount({ initialScreen: null, initialRound: null });
    expect(textOf(fixture.nativeElement.querySelector('ion-title'))).toBe('Estimating');
  });

  it('host: a menu, and the Reveal button', async () => {
    const { fixture } = await mount({ isHost: true, initialRound: votingRound() });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('ion-button[aria-label="More options"]')).not.toBeNull();
    expect(el.querySelector('ion-button[aria-label="Leave session"]')).toBeNull();
    expect(textOf(el.querySelector('ion-footer ion-button'))).toBe('Reveal votes');
  });

  it('everyone else: a one-tap Leave, behind a confirmation, and no footer', async () => {
    const { fixture, alerts } = await mount({ isHost: false, initialRound: votingRound() });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('ion-button[aria-label="More options"]')).toBeNull();
    expect(el.querySelector('ion-footer')).toBeNull();

    el.querySelector<HTMLElement>('ion-button[aria-label="Leave session"]')!.click();
    await vi.waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]!.buttons.map((b) => b.text)).toEqual(['Cancel', 'Leave']);
  });

  it('shows what is being estimated, description included', async () => {
    const round: Round = {
      ...votingRound(),
      ticketId: 'PROJ-42',
      title: 'Login form',
      description: 'First line\nSecond line',
    };
    const { fixture } = await mount({ initialRound: round });
    const story = (fixture.nativeElement as HTMLElement).querySelector('.story');
    expect(textOf(story?.querySelector('.ticket-chip'))).toBe('PROJ-42');
    expect(textOf(story?.querySelector('h2.descriptor'))).toBe('Login form');
    // No leading or trailing whitespace: the block is rendered pre-wrap.
    expect(story?.querySelector('.description-body')?.textContent).toBe('First line\nSecond line');
  });

  it('leaves the story block out when the round has no descriptor', async () => {
    const { fixture } = await mount({ initialRound: votingRound() });
    expect((fixture.nativeElement as HTMLElement).querySelector('.story')).toBeNull();
  });

  it('carries the role switch', async () => {
    const { fixture } = await mount({ initialRound: votingRound() });
    expect((fixture.nativeElement as HTMLElement).querySelector('app-role-toggle')).not.toBeNull();
  });
});

// onReveal — routes through revealCurrentRound; haptics + navigates on applied

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

// Skip-round action handler — routes through skipCurrentRound; haptics on applied

describe('EstimatingPage — skip-round action', () => {
  it('asks first: choosing Skip round skips nothing yet', async () => {
    const { fixture, skipCurrentRound, alerts, openSheetOrPopover } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    await tapSheetItem(fixture, openSheetOrPopover, 'Skip round');
    await vi.waitFor(() => expect(alerts).toHaveLength(1));

    expect(alerts[0]!.header).toBe('Skip this round?');
    expect(alerts[0]!.buttons.map((b) => [b.text, b.role])).toEqual([
      ['Cancel', 'cancel'],
      ['Skip round', 'destructive'],
    ]);
    expect(skipCurrentRound).not.toHaveBeenCalled();
  });

  it('skips, with haptics, once confirmed', async () => {
    const { fixture, skipCurrentRound, haptic, alerts, openSheetOrPopover } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    await tapSheetItem(fixture, openSheetOrPopover, 'Skip round');
    await vi.waitFor(() => expect(alerts).toHaveLength(1));
    tapAlertButton(alerts, 'Skip round');

    expect(skipCurrentRound).toHaveBeenCalledTimes(1);
    expect(haptic.impactHeavy).toHaveBeenCalled();
  });
});

describe('EstimatingPage — a skip that is answered late', () => {
  async function askToSkip() {
    const mounted = await mount({ isHost: true, initialRound: votingRound('r1') });
    await tapSheetItem(mounted.fixture, mounted.openSheetOrPopover, 'Skip round');
    await vi.waitFor(() => expect(mounted.alerts).toHaveLength(1));
    return mounted;
  }

  // Everyone voted while the question was up: the round revealed by itself.
  it('does not skip a round that is over', async () => {
    const mounted = await askToSkip();
    mounted.currentRoundSig.set(terminalRound('revealed', 'r1'));

    tapAlertButton(mounted.alerts, 'Skip round');

    expect(mounted.skipCurrentRound).not.toHaveBeenCalled();
  });

  // ...and the next one was started. The question was never about that one.
  it('does not skip the round that came after', async () => {
    const mounted = await askToSkip();
    mounted.currentRoundSig.set(votingRound('r2'));

    tapAlertButton(mounted.alerts, 'Skip round');

    expect(mounted.skipCurrentRound).not.toHaveBeenCalled();
    expect(mounted.haptic.impactHeavy).not.toHaveBeenCalled();
  });
});

// Making the question takes a moment. Everyone may have voted in it: the
// round reveals, and the page is left for the Lobby.
describe('EstimatingPage — a skip that is asked about too late', () => {
  async function chooseSkip(round = votingRound('r1')) {
    const mounted = await mount({ isHost: true, initialRound: round, holdAlerts: true });
    await tapSheetItem(mounted.fixture, mounted.openSheetOrPopover, 'Skip round');
    await vi.waitFor(() => expect(mounted.alerts).toHaveLength(1));
    return mounted;
  }

  it('asks when the round is still running', async () => {
    const mounted = await chooseSkip();

    mounted.alertsReady();

    await vi.waitFor(() => expect(mounted.presentAlert).toHaveBeenCalledOnce());
    expect(mounted.removeAlert).not.toHaveBeenCalled();
  });

  it('does not ask about a round that has ended meanwhile', async () => {
    const mounted = await chooseSkip();
    mounted.currentRoundSig.set(terminalRound('revealed', 'r1'));

    mounted.alertsReady();

    await vi.waitFor(() => expect(mounted.removeAlert).toHaveBeenCalledOnce());
    expect(mounted.presentAlert).not.toHaveBeenCalled();
    // Nothing is left behind for the page to close on its way out
    (
      mounted.fixture.componentInstance as unknown as { ionViewWillLeave(): void }
    ).ionViewWillLeave();
    expect(mounted.dismissAlert).not.toHaveBeenCalled();
  });

  it('nor about the round that came after it', async () => {
    const mounted = await chooseSkip();
    mounted.currentRoundSig.set(votingRound('r2'));

    mounted.alertsReady();

    await vi.waitFor(() => expect(mounted.removeAlert).toHaveBeenCalledOnce());
    expect(mounted.presentAlert).not.toHaveBeenCalled();
  });
});

describe('EstimatingPage — leaving the page', () => {
  it('closes the menu it opened', async () => {
    const { fixture, dismissMenu } = await mount({ isHost: true, initialRound: votingRound() });
    (fixture.componentInstance as unknown as { ionViewWillLeave(): void }).ionViewWillLeave();
    expect(dismissMenu).toHaveBeenCalledTimes(1);
  });

  // The page is left when the round reveals, whatever is on screen.
  it('takes the question about the round with it', async () => {
    const { fixture, alerts, dismissAlert, openSheetOrPopover, skipCurrentRound } = await mount({
      isHost: true,
      initialRound: votingRound(),
    });
    await tapSheetItem(fixture, openSheetOrPopover, 'Skip round');
    await vi.waitFor(() => expect(alerts).toHaveLength(1));

    (fixture.componentInstance as unknown as { ionViewWillLeave(): void }).ionViewWillLeave();

    expect(dismissAlert).toHaveBeenCalledExactlyOnceWith(undefined, 'cancel');
    expect(skipCurrentRound).not.toHaveBeenCalled();
  });

  it('has no question to close when none was asked', async () => {
    const { fixture, dismissAlert } = await mount({ isHost: true, initialRound: votingRound() });
    (fixture.componentInstance as unknown as { ionViewWillLeave(): void }).ionViewWillLeave();
    expect(dismissAlert).not.toHaveBeenCalled();
  });
});

// auto-reveal feedback effect — the rule and its driver are session-scoped in
// DocService (shared `startAutoReveal`); this page only fires the haptic off
// the counter the driver bumps. Rule coverage: shared/src/auto-reveal.test.ts;
// wiring coverage: core/doc/doc.service.auto-reveal.test.ts.

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

// card grid / abstain-button visibility — mirrors the `@else if (activeRound();
// as activeR)` branch. Success criterion: the card grid is gone as soon as
// the round is terminal, with no interactive frame in between.

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

// onCardTap / onAbstain — applied:false suppresses the haptic (mirrors the
// keydown-gate coverage in estimating.page.keyboard.test.ts).

describe('EstimatingPage — vote-command applied:false suppresses haptics', () => {
  type CardTapInternals = { onCardTap(card: string): void };
  type AbstainInternals = { onAbstain(): void };

  it('onCardTap: applied:false (not-a-voter) → no haptic', async () => {
    const { fixture, haptic } = await mount({ initialRound: votingRound() });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as {
      commands: { toggleCurrentVote: ReturnType<typeof vi.fn> };
    };
    ds.commands.toggleCurrentVote.mockReturnValue({ applied: false, reason: 'not-a-voter' });
    (fixture.componentInstance as unknown as CardTapInternals).onCardTap('1');
    expect(haptic.impactLight).not.toHaveBeenCalled();
  });

  it('onAbstain: applied:false (not-a-voter) → no haptic', async () => {
    const { fixture, haptic } = await mount({ initialRound: votingRound() });
    const DocService = (await import('../core/doc/doc.service')).DocService;
    const ds = TestBed.inject(DocService) as unknown as {
      commands: { toggleCurrentVote: ReturnType<typeof vi.fn> };
    };
    ds.commands.toggleCurrentVote.mockReturnValue({ applied: false, reason: 'not-a-voter' });
    (fixture.componentInstance as unknown as AbstainInternals).onAbstain();
    expect(haptic.impactLight).not.toHaveBeenCalled();
  });
});

// `docService.commands` call sites (#516)
//
// After the writer seam moved into `@hnch/shared` these handlers are thin
// adapters over the bound command set: fire the haptic only on `applied`, and
// bail before the command when there is no participant id to act as. The rules
// themselves are covered in `packages/shared`.

/** Action-sheet / alert item as the page declares it. */
interface SheetItem {
  text: string;
  role?: string;
  handler?: () => void;
}

/** Run the handler on the last-created alert's button labelled `text`. */
function tapAlertButton(alerts: { buttons: SheetItem[] }[], text: string): void {
  const cfg = alerts.at(-1);
  expect(cfg, 'no alert was created').toBeDefined();
  const button = cfg!.buttons.find((b) => b.text === text);
  expect(button, `no "${text}" button on the alert`).toBeDefined();
  button!.handler?.();
}

/** Open the ⋯ sheet and run the handler on the item labelled `text`. */
async function tapSheetItem(
  fixture: { componentInstance: unknown },
  openSheetOrPopover: { mock: { calls: unknown[][] } },
  text: string,
): Promise<void> {
  await (fixture.componentInstance as { openActionSheet(e: Event): Promise<void> }).openActionSheet(
    new Event('click'),
  );
  const [opts] = openSheetOrPopover.mock.calls.at(-1) as [{ items: SheetItem[] }];
  const item = opts.items.find((i) => i.text === text);
  expect(item, `no "${text}" item in the action sheet`).toBeDefined();
  item!.handler?.();
}

describe('EstimatingPage — onToggleRole', () => {
  type Internals = { onToggleRole(): void };

  it('fires the haptic and reaches the bound toggleRole command', async () => {
    const { fixture, docService, haptic } = await mount();
    (fixture.componentInstance as unknown as Internals).onToggleRole();

    expect(haptic.impactLight).toHaveBeenCalledTimes(1);
    expect(docService.commands.toggleRole).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the participant id exists', async () => {
    const { fixture, docService, haptic } = await mount({ myId: null });
    (fixture.componentInstance as unknown as Internals).onToggleRole();

    expect(docService.commands.toggleRole).not.toHaveBeenCalled();
    expect(haptic.impactLight).not.toHaveBeenCalled();
  });
});

// What leaving does (write `leave`, flush, tear down, forget, Home) is
// `SessionExitService`'s `left` exit and is tested there.
describe('EstimatingPage — leaveSession', () => {
  it("leaves the session as left from the host's menu", async () => {
    const { fixture, sessionExit, alerts, haptic, openSheetOrPopover } = await mount();

    await tapSheetItem(fixture, openSheetOrPopover, 'Leave session');
    tapAlertButton(alerts, 'Leave');

    expect(haptic.impactHeavy).toHaveBeenCalled();
    expect(sessionExit.exit).toHaveBeenCalledExactlyOnceWith({ kind: 'left' });
  });

  it("leaves the session as left from everyone else's toolbar button", async () => {
    const { fixture, sessionExit, alerts } = await mount({ isHost: false });

    await (
      fixture.componentInstance as unknown as { confirmLeave(): Promise<void> }
    ).confirmLeave();
    tapAlertButton(alerts, 'Leave');

    expect(sessionExit.exit).toHaveBeenCalledExactlyOnceWith({ kind: 'left' });
  });

  it('stays in the session when Leave is cancelled', async () => {
    const { fixture, sessionExit, alerts } = await mount({ isHost: false });

    await (
      fixture.componentInstance as unknown as { confirmLeave(): Promise<void> }
    ).confirmLeave();
    tapAlertButton(alerts, 'Cancel');

    expect(sessionExit.exit).not.toHaveBeenCalled();
  });
});

describe('EstimatingPage — confirmEndSession', () => {
  it('fires a heavy haptic when the host gate lets the end through', async () => {
    const { fixture, docService, alerts, haptic, openSheetOrPopover } = await mount({
      isHost: true,
    });
    docService.endSessionForEveryone.mockReturnValue({ applied: true });

    await tapSheetItem(fixture, openSheetOrPopover, 'End session for everyone');
    tapAlertButton(alerts, 'End session');

    expect(docService.endSessionForEveryone).toHaveBeenCalledTimes(1);
    expect(haptic.impactHeavy).toHaveBeenCalledTimes(1);
  });

  it('fires no haptic when the shared host gate refuses underneath the UI gate', async () => {
    const { fixture, docService, alerts, haptic, openSheetOrPopover } = await mount({
      isHost: true,
    });
    docService.endSessionForEveryone.mockReturnValue({ applied: false, reason: 'not-host' });

    await tapSheetItem(fixture, openSheetOrPopover, 'End session for everyone');
    tapAlertButton(alerts, 'End session');

    expect(haptic.impactHeavy).not.toHaveBeenCalled();
  });
});
