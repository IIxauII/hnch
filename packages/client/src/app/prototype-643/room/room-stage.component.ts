/**
 * PROTOTYPE (#643). The stage: every phase of the Room in place, for every role
 * (§2.1, §6.1, §6.2). Switches purely on `m.phase`, `m.isHost`, `m.self?.role`;
 * no route change between phases (UX-017).
 *
 *   story bar · status line (+ persistent polite live region)
 *   waiting   invite panel / After this / story field / Scale / queue-done totals
 *   voting    table in the middle (phone/tablet), hand at the bottom (deck + Pass)
 *   revealed  hero + Strip take the table's and deck's places (UX-034)
 *   host      hn-action-bar: the one primary, fixed slot
 *
 * Keyboard (UX-018, UX-019) lives in stage/stage-actions.ts and is active only
 * on the room screen, with no overlay open, outside fields and the lab panel.
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  HostListener,
  inject,
  Injector,
  type OnDestroy,
  signal,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { eyeOutline, playSkipForwardOutline, refreshOutline } from 'ionicons/icons';

import { ProtoStore } from '../proto-store';
import { type Outcome, PASS, type RoomState } from '../room-model';
import { ProtoStageActionBarComponent } from './stage/action-bar.component';
import { ProtoStageDeckComponent } from './stage/deck.component';
import { ProtoStageHeroComponent } from './stage/hero.component';
import { ProtoStageTableComponent } from './stage/presence-table.component';
import { StageKeys } from './stage/stage-actions';
import { joinNames, previousAccepted, spokenResult, StageUi } from './stage/stage-ui';
import { ProtoStageStoryBarComponent } from './stage/story-bar.component';
import { ProtoStageStripComponent } from './stage/strip.component';
import { ProtoStageWaitingComponent } from './stage/waiting.component';

@Component({
  selector: 'proto-room-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StageUi],
  imports: [
    IonIcon,
    ProtoStageStoryBarComponent,
    ProtoStageTableComponent,
    ProtoStageDeckComponent,
    ProtoStageHeroComponent,
    ProtoStageStripComponent,
    ProtoStageWaitingComponent,
    ProtoStageActionBarComponent,
  ],
  template: `
    @let m = store.m();
    @let me = m.self;
    @let o = m.outcome;
    <section class="stage" aria-labelledby="stage-h1" [attr.data-phase]="m.phase" data-ux="UX-017 UX-046 UX-086">
      <div class="body">
        <proto-stage-story-bar />
        <!-- visible status line: persistent, reserved height so nothing below shifts (UX-047) -->
        <p
          class="status"
          [class]="statusClass(o)"
          data-ux="UX-068 UX-047 UX-020 UX-036 UX-001"
        >
          <span>{{ statusHead() }}</span><span class="tail">{{ statusTail() }}</span>
        </p>
        <!-- one persistent polite live region, never inside @if (R-34); the waiting-on list stays out -->
        <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-ux="UX-068">
          {{ announcement() }}
        </p>

        <div class="phase">
          @switch (m.phase) {
            @case ('waiting') {
              <proto-stage-waiting />
            }
            @case ('voting') {
              <div class="voting">
                @if (m.previousOfRevote; as prev) {
                  <section class="ghost" aria-labelledby="ghost-h" data-ux="UX-038">
                    <h2 id="ghost-h" class="ghost-h">
                      Re-vote · last time {{ prev.outcome.min === prev.outcome.max ? prev.outcome.min : prev.outcome.min + '–' + prev.outcome.max }}
                    </h2>
                    <proto-stage-strip mode="ghost" />
                  </section>
                }
                <proto-stage-table class="table-slot" />
                @if (me?.role === 'viewer') {
                  <section class="watching" aria-labelledby="watch-h" data-ux="UX-086 UX-047">
                    <h2 id="watch-h" class="watch-h"><ion-icon name="eye-outline" aria-hidden="true" />You're watching</h2>
                    <p class="sub">You see who has voted. Cards stay hidden until the reveal.</p>
                    <button type="button" class="hn-btn secondary" (click)="m.setRole('voter')" [attr.title]="fine() ? 'Vote instead (w)' : null">
                      Vote instead
                    </button>
                  </section>
                } @else if (me) {
                  <proto-stage-deck class="deck-slot" />
                }
              </div>
            }
            @case ('revealed') {
              @if (o) {
                <div class="revealed">
                  <proto-stage-hero class="hero-slot" />
                  <proto-stage-strip />
                  <div class="lines">
                    @if (lowHigh(o); as lh) {
                      <p class="lowhigh" data-ux="UX-035">{{ lh }}</p>
                    }
                    @if (o.didntVote.length) {
                      <p class="meta" data-ux="UX-008">Didn't vote: {{ names(o.didntVote) }}</p>
                    }
                    @if (o.passes.length && o.kind !== 'none') {
                      <p class="meta">Pass: {{ names(o.passes) }}</p>
                    }
                    @if (m.isHost && o.kind !== 'agreed' && o.kind !== 'none') {
                      @let pick = m.activeRound?.hostPick;
                      @if (pick) {
                        <p class="hint">
                          Accepting {{ pick }}{{ o.suggestion ? ' instead of ' + o.suggestion : '' }}
                          @if (o.suggestion) {
                            <button type="button" class="hn-btn quiet inline" (click)="m.pick(o.suggestion)">Use {{ o.suggestion }}</button>
                          }
                        </p>
                      } @else {
                        <p class="hint" data-ux="UX-035">
                          {{ fine() ? 'Pick a value, or press ← →, to accept it instead' : 'Tap a value to accept it instead' }}
                        </p>
                      }
                    }
                  </div>
                  @if (m.isHost) {
                    <div class="stage-actions">
                      @if (m.primary.action !== 'revote') {
                        <button type="button" class="hn-btn quiet revote" (click)="m.revote()" [attr.title]="fine() ? 'Re-vote (r)' : null">
                          <ion-icon name="refresh-outline" aria-hidden="true" />Re-vote
                        </button>
                      }
                      @if (m.currentStory) {
                      <button type="button" class="hn-btn quiet skip" [class.always]="o.kind === 'none'" (click)="m.skip()" [attr.title]="fine() ? 'Skip story (s)' : null">
                        <ion-icon name="play-skip-forward-outline" aria-hidden="true" />Skip story
                      </button>
                      }
                    </div>
                  }
                </div>
              }
            }
          }
        </div>
      </div>
      @if (m.isHost) {
        <proto-stage-action-bar />
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }
    .stage {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      width: 100%;
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--hn-space-2);
      padding: var(--hn-space-4);
    }
    .status {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
      /* two lines reserved from round start: "waiting on" never shifts the deck (UX-047) */
      min-height: 40px;
    }
    .status .tail {
      color: var(--hn-text-3);
    }
    .phase {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .voting,
    .revealed {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--hn-space-3);
    }
    .table-slot {
      flex: 1;
    }
    .deck-slot {
      margin-top: auto;
    }
    .hero-slot {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .ghost {
      display: grid;
      gap: var(--hn-space-1);
    }
    .ghost-h {
      margin: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .watching {
      margin-top: auto;
      display: grid;
      justify-items: start;
      gap: var(--hn-space-2);
      padding: var(--hn-space-4);
      border-radius: var(--hn-radius-md);
      background: var(--hn-surface-2);
    }
    .watch-h {
      margin: 0;
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      font: var(--hn-type-label);
    }
    .sub {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .lines {
      display: grid;
      gap: var(--hn-space-1);
    }
    .lowhigh {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text);
    }
    .meta,
    .hint {
      margin: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .hint {
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      flex-wrap: wrap;
    }
    .hn-btn.inline {
      min-height: 32px;
      font: var(--hn-type-caption);
    }
    .stage-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--hn-space-2);
    }
    ion-icon {
      font-size: 20px;
    }
    /* tablet: the phone layout in a 560 px column (UX-046) */
    @container device (min-width: 600px) {
      .stage {
        max-width: 560px;
        margin: 0 auto;
      }
    }
    /* desktop: one elevated surface; body keeps its height so the footer row never jumps (R-20, D17) */
    @container device (min-width: 1024px) {
      .stage {
        max-width: none;
        margin: 0;
        background: var(--hn-surface);
        border-radius: var(--hn-radius-lg);
        box-shadow: var(--hn-e1);
        border: 1px solid var(--hn-e1-border);
        padding: var(--hn-space-6);
      }
      .body {
        padding: 0;
        flex: none;
      }
      .status {
        min-height: 20px;
      }
      .phase {
        /* --hn-stage-body-min is 320 in the plan; hero + Strip at a 5-dot cap + 2 lines need ~430 */
        min-height: calc(var(--hn-space-8) * 7 - var(--hn-space-4));
      }
      .table-slot {
        display: none;
      }
      .deck-slot {
        margin-top: var(--hn-space-3);
      }
      .hero-slot {
        flex: none;
      }
      /* desktop: Re-vote sits in the footer row next to the primary (§6.2) */
      .stage-actions .revote,
      .stage-actions .skip:not(.always) {
        display: none;
      }
      .watching {
        margin-top: var(--hn-space-3);
      }
    }
    @container device (min-width: 1600px) {
      .phase {
        min-height: calc(var(--hn-space-8) * 8);
      }
    }
  `,
})
export class ProtoRoomStageComponent implements OnDestroy {
  protected readonly store = inject(ProtoStore);
  private readonly ui = inject(StageUi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly keys = new StageKeys(this.store, this.ui);

  protected readonly announcement = signal('');
  private last:
    | {
        state: RoomState;
        self: string;
        phase: string;
        round: string;
        mine: string;
        settle: boolean;
        pick: string;
        conn: string;
      }
    | undefined;

  constructor() {
    addIcons({ eyeOutline, playSkipForwardOutline, refreshOutline });
    effect(() => this.onModelChange());
  }

  ngOnDestroy() {
    this.keys.reset();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (this.keys.handle(e)) e.preventDefault();
  }

  protected fine(): boolean {
    return this.store.pointer() === 'fine';
  }

  // ── status line ──
  private split(): [string, string] {
    const line = this.store.m().statusLine;
    const i = line.indexOf(' · waiting on ');
    return i < 0 ? [line, ''] : [line.slice(0, i), line.slice(i)];
  }
  protected statusHead(): string {
    return this.split()[0];
  }
  protected statusTail(): string {
    return this.split()[1];
  }
  protected statusClass(o: Outcome | undefined): string {
    if (!o || this.store.m().phase !== 'revealed') return 'status';
    const k = o.kind === 'one' ? 'none' : o.kind;
    return `status st-${k}`;
  }

  protected names(ids: string[]): string {
    const m = this.store.m();
    return joinNames(ids.map((id) => (id === m.state.selfId ? 'you' : m.nameOf(id))));
  }

  /** "Low: Ana (5) · High: Dev (13)", only the side that differs (UX-035). */
  protected lowHigh(o: Outcome): string | undefined {
    const parts: string[] = [];
    if (o.low) parts.push(`Low: ${joinNames(o.low.names)} (${o.low.value ?? ''})`);
    if (o.high) parts.push(`High: ${joinNames(o.high.names)} (${o.high.value ?? ''})`);
    return parts.length ? parts.join(' · ') : undefined;
  }

  // ── announcements (R-34) + focus anchor (R-62) ──
  private onModelChange() {
    const m = this.store.m();
    const r = m.activeRound;
    const now = {
      state: m.state,
      self: m.state.selfId,
      phase: m.phase,
      round: r?.id ?? '',
      mine: r?.votes[m.state.selfId] ?? '',
      settle: !!m.state.settleUntil,
      pick: r?.hostPick ?? '',
      conn: m.state.connection,
    };
    const prev = this.last;
    this.last = now;
    // a scene / fixture load replaces the state object: no announcement, no focus move
    if (!prev || prev.state !== now.state || prev.self !== now.self) {
      this.keys.reset();
      return;
    }
    const host = m.host?.name ?? 'the host';
    let say: string | undefined;
    if (prev.conn !== now.conn) say = now.conn === 'live' ? 'Back online' : 'Reconnecting…';
    else if (prev.phase !== now.phase || prev.round !== now.round) {
      this.keys.reset();
      if (now.phase === 'voting') {
        const pa = previousAccepted(m);
        const title = m.currentStory?.title ?? r?.title ?? '';
        say = `${pa ? `Agreed ${pa.value} for ${pa.label}. ` : ''}Voting on ${title}${r?.revoteOf ? ', re-vote' : ''}`;
      } else if (now.phase === 'revealed' && m.outcome) {
        say = spokenResult(m.outcome);
      } else if (now.phase === 'waiting') {
        say = m.isHost
          ? m.nextStory
            ? `Up next: ${m.nextStory.title}`
            : 'Add a story or just start'
          : `Waiting for ${host} to start`;
      }
      this.moveFocus(now.phase);
    } else if (now.phase === 'voting' && prev.mine !== now.mine) {
      say = now.mine
        ? now.mine === PASS
          ? 'You passed'
          : `You voted ${now.mine}`
        : 'Vote cleared';
    } else if (now.phase === 'voting' && now.settle && !prev.settle) {
      say = "Everyone's in";
    } else if (now.phase === 'revealed' && prev.pick !== now.pick) {
      const v = m.acceptValue ?? '';
      say = m.isHost
        ? `Accepting ${v}`
        : now.pick
          ? `${host} picked ${now.pick}`
          : `${host} went back to ${v}`;
    }
    if (say) this.announcement.set(say);
  }

  /** When a phase change removed the focused element, land on the hero (revealed) or the H1. */
  private moveFocus(phase: string) {
    afterNextRender(
      () => {
        const a = document.activeElement;
        if (a && a !== document.body && a.isConnected) return;
        const root = this.host.nativeElement;
        const target =
          (phase === 'revealed' ? root.querySelector<HTMLElement>('#stage-hero') : null) ??
          root.querySelector<HTMLElement>('#stage-h1');
        target?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
}
