/**
 * TestBed component tests for the EstimatingPage keyboard handler
 * (issue #154). Mounts the real EstimatingPage with stub services and
 * dispatches synthetic KeyboardEvents on `document` to drive the
 * @HostListener.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { canEnterTerminal, UNBOUND_SESSION_COMMANDS, type Round } from '@hnch/shared';

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
    AlertController: class AlertController {},
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

const FIB_ROUND: Round = {
  id: 'r1',
  startedAt: 1,
  createdAt: 0,
  createdBy: 'host',
  status: 'voting',
  scale: { id: 'fibonacci', cards: ['0', '1', '2', '3', '5', '8', '13', '21'] },
  votes: {},
};

interface MountOptions {
  round?: Round | null;
  isViewer?: boolean;
  myVote?: string;
}

async function mountEstimating(opts: MountOptions = {}) {
  // Deep-copy so per-test mutation (myVote injection below) never leaks
  // into FIB_ROUND or any other caller's round object across tests.
  const round = opts.round === null ? null : structuredClone(opts.round ?? FIB_ROUND);

  const { DocService } = await import('../core/doc/doc.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { HapticService } = await import('../core/haptic.service');
  const { LastSessionService } = await import('../core/last-session.service');
  const { TimerTickService } = await import('../core/timer-tick.service');
  const { SurfaceService } = await import('../core/surface.service');
  const { Router } = await import('@angular/router');
  const { ToastService } = await import('../services/toast.service');
  const { AlertController } = await import('@ionic/angular/standalone');

  const toggleCurrentVote = vi.fn().mockReturnValue({ applied: true, effect: 'cast' });
  const clearCurrentVote = vi.fn().mockReturnValue({ applied: true, effect: 'cleared' });
  const impactLight = vi.fn();

  // activeRound mirrors the shared `activeRound()` projection: the round
  // when it's still pending/voting, else null — no anchor fallback.
  const activeRoundValue = round && canEnterTerminal(round.status) ? round : null;

  const docService = {
    currentRound: signal(round).asReadonly(),
    activeRound: signal(activeRoundValue).asReadonly(),
    // `DocService.screen` mirrors the shared `screenFor()` selector: an
    // active round means Estimating, otherwise Lobby (issue #508).
    screen: signal(activeRoundValue ? ('estimating' as const) : ('lobby' as const)).asReadonly(),
    rounds: signal([round].filter(Boolean) as Round[]).asReadonly(),
    onlineParticipants: signal([]).asReadonly(),
    onlineParticipantIds: signal(new Set<string>()).asReadonly(),
    participants: signal(
      opts.isViewer
        ? [{ id: 'me', name: 'Me', role: 'viewer' as const }]
        : [{ id: 'me', name: 'Me' }],
    ).asReadonly(),
    activeParticipants: signal(
      opts.isViewer
        ? [{ id: 'me', name: 'Me', role: 'viewer' as const }]
        : [{ id: 'me', name: 'Me' }],
    ).asReadonly(),
    settings: signal({ hostParticipantId: 'me' }).asReadonly(),
    roomCode: signal('AAAAAA').asReadonly(),
    meta: signal({ roomUuid: 'uuid' }).asReadonly(),
    syncStatus: signal('idle').asReadonly(),
    relaySynced: signal(false).asReadonly(),
    relayRoomUuid: signal(null).asReadonly(),
    autoRevealCount: signal(0).asReadonly(),
    commands: {
      ...UNBOUND_SESSION_COMMANDS,
      toggleCurrentVote,
      clearCurrentVote,
      revealCurrentRound: vi.fn(),
      skipCurrentRound: vi.fn(),
      leave: vi.fn(),
      toggleRole: vi.fn(),
    },
    flushUpdates: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn(),
    endSessionForEveryone: vi.fn(),
  };

  // Inject a vote into the round if requested.
  if (opts.myVote && round) {
    round.votes = { ...round.votes, me: opts.myVote };
  }

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DocService, useValue: docService },
      { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
      {
        provide: HapticService,
        useValue: {
          impactLight,
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
        },
      },
      { provide: TimerTickService, useValue: { now: () => 0 } },
      {
        provide: SurfaceService,
        useValue: {
          mode: signal('desktop').asReadonly(),
          openSheetOrPopover: vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      { provide: ToastService, useValue: { info: vi.fn(), error: vi.fn() } },
      {
        provide: AlertController,
        useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn() }) },
      },
    ],
  });

  const { EstimatingPage } = await import('./estimating.page');
  const fixture = TestBed.createComponent(EstimatingPage);
  fixture.detectChanges();
  return { fixture, toggleCurrentVote, clearCurrentVote, impactLight };
}

function dispatchKey(init: Partial<KeyboardEventInit> & { code?: string; key?: string }) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: init.key ?? '',
    code: init.code ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
  });
  document.dispatchEvent(event);
  return event;
}

// Exercises: estimating.page:EstimatingPage (document:keydown HostListener via real component)
describe('EstimatingPage — keyboard handler (issue #154)', () => {
  beforeEach(() => {
    // Reset focus and ensure no editable element holds focus between tests.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  it('Digit1 casts the first card', async () => {
    const { toggleCurrentVote, impactLight } = await mountEstimating();
    dispatchKey({ code: 'Digit1', key: '1' });
    expect(toggleCurrentVote).toHaveBeenCalledWith('0');
    expect(impactLight).toHaveBeenCalled();
  });

  it('Digit0 casts the 10th card when scale has 10+ cards', async () => {
    const linearRound: Round = {
      id: 'r1',
      startedAt: 1,
      createdAt: 0,
      createdBy: 'host',
      status: 'voting',
      scale: { id: 'linear', cards: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
      votes: {},
    };
    const { toggleCurrentVote } = await mountEstimating({ round: linearRound });
    dispatchKey({ code: 'Digit0', key: '0' });
    expect(toggleCurrentVote).toHaveBeenCalledWith('10');
  });

  it('Re-pressing the digit bound to current vote calls toggleCurrentVote with the same card', async () => {
    // The toggle rule (cast vs. clear) now lives in @hnch/shared's
    // vote-commands.toggleCurrentVote — the keyboard resolver just reports
    // 'cast' with the card at that index, same card or not.
    const { toggleCurrentVote } = await mountEstimating({ myVote: '0' });
    dispatchKey({ code: 'Digit1', key: '1' });
    expect(toggleCurrentVote).toHaveBeenCalledWith('0');
  });

  it('Modifier-held digit is a no-op (defers to browser)', async () => {
    const { toggleCurrentVote } = await mountEstimating();
    dispatchKey({ code: 'Digit1', key: '1', ctrlKey: true });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('Skips when focus is inside an INPUT', async () => {
    const { toggleCurrentVote } = await mountEstimating();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    try {
      dispatchKey({ code: 'Digit1', key: '1' });
      expect(toggleCurrentVote).not.toHaveBeenCalled();
    } finally {
      input.remove();
    }
  });

  it('Skips when an ion-popover overlay is open above the page', async () => {
    const { toggleCurrentVote } = await mountEstimating();
    const overlay = document.createElement('ion-popover');
    document.body.appendChild(overlay);
    try {
      dispatchKey({ code: 'Digit1', key: '1' });
      expect(toggleCurrentVote).not.toHaveBeenCalled();
    } finally {
      overlay.remove();
    }
  });

  it('Skips when no round is active', async () => {
    const { toggleCurrentVote } = await mountEstimating({ round: null });
    dispatchKey({ code: 'Digit1', key: '1' });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('Skips when local user is a viewer', async () => {
    const { toggleCurrentVote } = await mountEstimating({ isViewer: true });
    dispatchKey({ code: 'Digit1', key: '1' });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('Skips when the round is already revealed', async () => {
    const revealedRound: Round = { ...FIB_ROUND, status: 'revealed', terminalAt: 1000 };
    const { toggleCurrentVote } = await mountEstimating({ round: revealedRound });
    dispatchKey({ code: 'Digit1', key: '1' });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('Skips when the round is already skipped', async () => {
    const skippedRound: Round = { ...FIB_ROUND, status: 'skipped', terminalAt: 1000 };
    const { toggleCurrentVote } = await mountEstimating({ round: skippedRound });
    dispatchKey({ code: 'Digit1', key: '1' });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('Skips when the round is already discarded', async () => {
    const discardedRound: Round = { ...FIB_ROUND, status: 'discarded', terminalAt: 1000 };
    const { toggleCurrentVote } = await mountEstimating({ round: discardedRound });
    dispatchKey({ code: 'Digit1', key: '1' });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('applied:false (not-a-voter) suppresses haptic and leaves focus cursor unmoved', async () => {
    const { fixture, toggleCurrentVote, impactLight } = await mountEstimating();
    toggleCurrentVote.mockReturnValue({ applied: false, reason: 'not-a-voter' });
    const page = fixture.componentInstance as unknown as {
      focusedIndex: () => number | undefined;
    };
    const focusBefore = page.focusedIndex();
    dispatchKey({ code: 'Digit1', key: '1' });
    expect(toggleCurrentVote).toHaveBeenCalledWith('0');
    expect(impactLight).not.toHaveBeenCalled();
    expect(page.focusedIndex()).toBe(focusBefore);
  });

  it('ArrowRight does not cast (focus only)', async () => {
    const { toggleCurrentVote, clearCurrentVote } = await mountEstimating();
    dispatchKey({ key: 'ArrowRight' });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
    expect(clearCurrentVote).not.toHaveBeenCalled();
  });

  it('Letter key is a no-op', async () => {
    const { toggleCurrentVote } = await mountEstimating();
    dispatchKey({ key: 'a', code: 'KeyA' });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
  });

  it('Digit beyond scale length is a no-op (T-shirt 5 cards, Digit6)', async () => {
    const tshirtRound: Round = {
      id: 'r1',
      startedAt: 1,
      scale: { id: 't-shirt', cards: ['XS', 'S', 'M', 'L', 'XL'] },
      votes: {},
    };
    const { toggleCurrentVote } = await mountEstimating({ round: tshirtRound });
    dispatchKey({ code: 'Digit6', key: '6' });
    expect(toggleCurrentVote).not.toHaveBeenCalled();
  });
});
