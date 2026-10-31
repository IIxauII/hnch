/**
 * PROTOTYPE (#643). hn-table (phone/tablet): presence dots + names centred as
 * the "table", filling as people vote (PW #13). State is glyph + word, never
 * colour alone: ✓ voted · waiting ◌ syncing/away. Viewers sit apart as
 * "– Eve watching". During the settle window the dots close into a ring and the
 * ring fills (UX-014); a vote change restarts it. Hidden on desktop: the rail
 * shows people there.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { type Person } from '../../room-model';
import { ProtoStore } from '../../proto-store';
import { dotColors, initialOf } from './stage-ui';

interface Seat {
  p: Person;
  name: string;
  glyph: string;
  word: string;
  voted: boolean;
  bg: string;
  ink: string;
}

@Component({
  selector: 'proto-stage-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = store.m();
    @let settle = m.state.settleUntil;
    <section
      class="table"
      [class.settle]="!!settle"
      [class.compact]="compact()"
      aria-labelledby="table-h"
      data-ux="UX-001 UX-014 UX-047 UX-008"
    >
      <h2 id="table-h" class="visually-hidden">Who has voted</h2>
      <div class="cluster">
        @if (settle) {
          @for (k of [settle]; track k) {
            <svg class="ring" aria-hidden="true" preserveAspectRatio="none">
              <rect
                x="1"
                y="1"
                rx="28"
                pathLength="100"
                [style.animation-duration.ms]="settleLeft(k)"
              />
            </svg>
          }
        }
        <ul class="seats" role="list">
          @for (s of seats(); track s.p.id) {
            <li class="seat" [class.voted]="s.voted" [attr.title]="s.name + ' · ' + s.word">
              <span
                class="dot"
                aria-hidden="true"
                [style.--dot]="s.bg"
                [style.--ink]="s.ink"
                >{{ initial(s.p.name) }}</span
              >
              <span class="name"
                ><span class="g" aria-hidden="true">{{ s.glyph }}</span>
                {{ s.name }}<span class="visually-hidden">, {{ s.word }}</span></span
              >
            </li>
          }
        </ul>
      </div>
      @if (viewers().length) {
        <p class="viewers">– {{ viewers() === 'you' ? "you're" : viewers() }} watching</p>
      }
      @if (lateNote()) {
        <p class="late" data-ux="UX-008">Voting on {{ m.currentStory?.key || 'this story' }} · you count once you vote</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .table {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--hn-space-2);
      padding: var(--hn-space-3) 0;
    }
    .cluster {
      position: relative;
      padding: var(--hn-space-2) var(--hn-space-3);
    }
    .seats {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--hn-space-3) var(--hn-space-4);
      max-width: 300px;
      transition: gap var(--hn-dur-enter) var(--hn-ease-std);
    }
    .settle .seats {
      gap: var(--hn-space-2) var(--hn-space-2);
    }
    .seat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--hn-space-1);
      min-width: 56px;
    }
    .dot {
      width: 36px;
      height: 36px;
      border-radius: var(--hn-radius-pill);
      display: grid;
      place-items: center;
      font: var(--hn-type-caption);
      /* waiting: hollow ring in the person's colour; voted: filled (never colour alone, see the glyph) */
      background: var(--hn-surface);
      color: var(--hn-text-2);
      box-shadow:
        inset 0 0 0 2px var(--dot),
        0 0 0 1.5px var(--hn-surface);
      transition:
        background-color var(--hn-dur-state) var(--hn-ease-std),
        color var(--hn-dur-state) var(--hn-ease-std);
    }
    .voted .dot {
      background: var(--dot);
      color: var(--ink);
    }
    .name {
      font: var(--hn-type-caption);
      color: var(--hn-text-2);
      white-space: nowrap;
    }
    .g {
      color: var(--hn-text-3);
    }
    .voted .g {
      color: var(--hn-success);
    }
    .ring {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }
    .ring rect {
      width: calc(100% - 2px);
      height: calc(100% - 2px);
      fill: none;
      stroke: var(--hn-accent-text);
      stroke-width: 2;
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
      animation-name: fill-ring;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }
    @keyframes fill-ring {
      to {
        stroke-dashoffset: 0;
      }
    }
    .viewers,
    .late {
      margin: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .compact .dot {
      width: 28px;
      height: 28px;
    }
    .compact .seats {
      gap: var(--hn-space-2) var(--hn-space-3);
    }
    .compact .seat {
      min-width: 44px;
    }
  `,
})
export class ProtoStageTableComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly initial = initialOf;
  protected readonly compact = computed(
    () => this.store.frame() === 'small-phone' || !!this.store.m().previousOfRevote,
  );

  protected seats(): Seat[] {
    const m = this.store.m();
    const r = m.activeRound;
    const theme = this.store.theme();
    return m.present
      .filter((p) => p.role === 'voter')
      .map((p) => {
        const voted = !!r && p.id in r.votes;
        const away = !p.online || p.steppedOut;
        const glyph = voted ? '✓' : !p.synced ? '◌' : away ? '◌' : '·';
        const word = voted ? 'voted' : !p.synced ? 'syncing' : away ? 'away' : 'waiting';
        const c = dotColors(p, theme);
        return {
          p,
          name: p.id === m.state.selfId ? 'you' : p.name,
          glyph,
          word,
          voted,
          bg: c.bg,
          ink: c.ink,
        };
      });
  }

  protected viewers(): string {
    const m = this.store.m();
    return m.present
      .filter((p) => p.role === 'viewer')
      .map((p) => (p.id === m.state.selfId ? 'you' : p.name))
      .join(', ');
  }

  /** Late joiner (O14 'once-they-vote'): not counted until they vote (§6.7 S9). */
  protected lateNote(): boolean {
    const m = this.store.m();
    const r = m.activeRound;
    const me = m.self;
    return (
      !!r &&
      me?.role === 'voter' &&
      m.state.decisions.lateJoiners === 'once-they-vote' &&
      !r.eligibleAtStart.includes(me.id) &&
      !(me.id in r.votes)
    );
  }

  protected settleLeft(until: number): number {
    return Math.max(50, until - Date.now());
  }
}
