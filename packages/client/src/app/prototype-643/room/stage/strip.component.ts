/**
 * PROTOTYPE (#643). hn-strip: dot plot over the FULL scale (empty columns
 * kept), Pass apart, mode column tinted, suggested caret ▲, stacks cap at 5
 * (3 below 700 px tall) then "+N", hollow dots for the previous tally of a
 * re-vote (UX-038). The plot is role="img" with a visually hidden table; the
 * host gets full-height column hit areas layered on top to pick a value.
 *
 * mode="ghost": the compact previous-tally strip shown while a re-vote is voting.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { type Outcome, type Person } from '../../room-model';
import { FRAME_SIZE, ProtoStore } from '../../proto-store';
import { dotColors, initialOf } from './stage-ui';

interface Dot {
  id: string;
  name: string;
  initial: string;
  bg: string;
  ink: string;
  hollow: boolean;
}
interface Col {
  face: string;
  dots: Dot[];
  more: number;
  mode: boolean;
  names: string[];
  count: number;
  ghost: number;
}

@Component({
  selector: 'proto-stage-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = store.m();
    @let o = outcome();
    @if (o) {
      @let pick = m.activeRound?.hostPick;
      @let accept = m.acceptValue;
      <div
        class="strip"
        [class.ghost]="mode() === 'ghost'"
        [style.--n]="cols().length"
        [style.--cap]="mode() === 'ghost' ? 3 : cap()"
        data-ux="UX-034 UX-035 UX-038"
      >
        <div class="plot" role="img" [attr.aria-label]="summary()">
          @for (c of cols(); track c.face) {
            <div class="col" [class.mode]="c.mode && mode() === 'full' && o.kind !== 'split'" [class.picked]="!!pick && c.face === pick">
              <div class="stack">
                @for (d of c.dots; track d.id) {
                  <span
                    class="dot"
                    [class.hollow]="d.hollow"
                    [style.--dot]="d.bg"
                    [style.--ink]="d.ink"
                    [attr.title]="fine() ? d.name : null"
                    >{{ d.hollow ? '' : d.initial }}</span
                  >
                }
                @if (c.more) {
                  <span class="more tnum">+{{ c.more }}</span>
                }
              </div>
              <span class="face tnum">{{ c.face }}</span>
              <span class="caret" aria-hidden="true">{{ mode() === 'full' && c.face === o.suggestion && o.kind !== 'split' ? '▲' : '' }}</span>
            </div>
          }
          <div class="sep" aria-hidden="true"></div>
          <div class="col pass">
            <div class="stack">
              @for (d of passDots(); track d.id) {
                <span class="dot" [class.hollow]="d.hollow" [style.--dot]="d.bg" [style.--ink]="d.ink" [attr.title]="fine() ? d.name : null">{{
                  d.hollow ? '' : d.initial
                }}</span>
              }
            </div>
            <span class="face">Pass</span>
            <span class="caret"></span>
          </div>
        </div>
        @if (mode() === 'full' && m.isHost) {
          <div class="hits" role="group" aria-label="Pick a value to accept" data-ux="UX-035 UX-073">
            @for (c of cols(); track c.face) {
              <button
                type="button"
                class="hit"
                [attr.aria-pressed]="c.face === accept"
                [attr.aria-label]="'Accept ' + c.face + ' · ' + c.count + (c.count === 1 ? ' vote' : ' votes')"
                [attr.title]="fine() ? 'Accept ' + c.face + ' (← →)' : null"
                (click)="m.pick(c.face)"
              ></button>
            }
            <span class="hit-gap" aria-hidden="true"></span>
          </div>
        }
        <table class="visually-hidden">
          <caption>
            {{ mode() === 'ghost' ? 'Last time' : 'Votes' }}
          </caption>
          <thead>
            <tr>
              <th scope="col">Value</th>
              <th scope="col">Votes</th>
              <th scope="col">Who</th>
            </tr>
          </thead>
          <tbody>
            @for (c of cols(); track c.face) {
              @if (c.count) {
                <tr>
                  <th scope="row">{{ c.face }}{{ c.face === o.suggestion && o.kind !== 'split' ? ' (suggested)' : '' }}</th>
                  <td>{{ c.count }}</td>
                  <td>{{ c.names.join(', ') }}</td>
                </tr>
              }
            }
            @if (o.passes.length) {
              <tr>
                <th scope="row">Pass</th>
                <td>{{ o.passes.length }}</td>
                <td>{{ names(o.passes).join(', ') }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .strip {
      position: relative;
      --dot-size: 24px;
      --pass-w: 44px;
      --sep-w: 9px;
    }
    .plot,
    .hits {
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr)) var(--sep-w) var(--pass-w);
      column-gap: 0;
    }
    .hits {
      position: absolute;
      inset: 0;
    }
    .hit {
      appearance: none;
      border: 0;
      background: transparent;
      border-radius: var(--hn-radius-sm);
      cursor: pointer;
      min-height: var(--hn-tap);
    }
    .hit-gap {
      grid-column: span 2;
    }
    .col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--hn-space-1);
      border-radius: var(--hn-radius-sm);
      padding: var(--hn-space-1) 0;
      min-width: 0;
    }
    .col.mode {
      background: var(--hn-accent-soft);
    }
    .stack {
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      justify-content: flex-start;
      gap: 2px;
      /* bounded height: cap dots + the +N chip (D17, CD-04) */
      height: calc((var(--cap) + 1) * (var(--dot-size) + 2px));
    }
    .dot {
      flex: none;
      width: var(--dot-size);
      height: var(--dot-size);
      border-radius: var(--hn-radius-pill);
      display: grid;
      place-items: center;
      background: var(--dot);
      color: var(--ink);
      font: var(--hn-type-caption);
      /* 1.5 px surface ring separates every dot from the mode tint (§5.1) */
      box-shadow: 0 0 0 1.5px var(--hn-surface);
    }
    .dot.hollow {
      background: transparent;
      box-shadow: inset 0 0 0 1.5px var(--hn-line-strong);
    }
    .more {
      font: var(--hn-type-caption);
      color: var(--hn-text-2);
    }
    .face {
      font: var(--hn-type-small);
      font-weight: 600;
      color: var(--hn-text-3);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .col.mode .face {
      color: var(--hn-text);
    }
    .col.picked {
      box-shadow: inset 0 0 0 2px var(--hn-accent-text);
    }
    .caret {
      font: var(--hn-type-caption);
      color: var(--hn-accent-text);
      height: 16px;
    }
    .sep {
      justify-self: center;
      width: 1px;
      background: var(--hn-line);
    }
    .ghost {
      --dot-size: 12px;
    }
    .ghost .face {
      font: var(--hn-type-caption);
    }
    .ghost .caret {
      display: none;
    }
    @container device (min-width: 1024px) {
      .strip {
        --dot-size: 28px;
        --pass-w: 56px;
      }
      .ghost {
        --dot-size: 12px;
      }
    }
    @container device (min-width: 1600px) {
      .strip {
        --dot-size: 36px;
      }
    }
  `,
})
export class ProtoStageStripComponent {
  protected readonly store = inject(ProtoStore);
  readonly mode = input<'full' | 'ghost'>('full');
  protected readonly fine = computed(() => this.store.pointer() === 'fine');
  /** Stacks cap at 5 dots, 3 below 700 px tall (CD-04). */
  protected readonly cap = computed(() => (FRAME_SIZE[this.store.frame()].h < 700 ? 3 : 5));

  protected outcome(): Outcome | undefined {
    const m = this.store.m();
    return this.mode() === 'ghost' ? m.previousOfRevote?.outcome : m.outcome;
  }

  /** Previous tally of a re-vote, by face (hollow dots in full mode). */
  private ghostCounts(): Map<string, number> {
    const prev = this.store.m().previousOfRevote?.outcome;
    const map = new Map<string, number>();
    if (!prev || this.mode() === 'ghost') return map;
    for (const c of prev.columns) map.set(c.face, c.ids.length);
    map.set('__pass', prev.passes.length);
    return map;
  }

  private dot(p: Person | undefined, id: string, hollow: boolean): Dot {
    const m = this.store.m();
    const c = dotColors(p, this.store.theme());
    const name = id === m.state.selfId ? 'you' : (p?.name ?? '?');
    return { id, name, initial: initialOf(p?.name ?? '?'), bg: c.bg, ink: c.ink, hollow };
  }

  protected names(ids: string[]): string[] {
    const m = this.store.m();
    return ids.map((id) => (id === m.state.selfId ? 'you' : m.nameOf(id)));
  }

  protected cols(): Col[] {
    const m = this.store.m();
    const o = this.outcome();
    if (!o) return [];
    const ghost = this.ghostCounts();
    const asGhost = this.mode() === 'ghost';
    const cap = asGhost ? 3 : this.cap();
    return o.columns.map((c) => {
      const solid = c.ids.map((id) => this.dot(m.person(id), id, asGhost));
      const hollow = Array.from({ length: ghost.get(c.face) ?? 0 }, (_, i) =>
        this.dot(undefined, `g-${c.face}-${i}`, true),
      );
      // real votes first; hollow (last time) dots only fill the room that is left
      const shown = [...solid.slice(0, cap), ...hollow.slice(0, Math.max(0, cap - solid.length))];
      return {
        face: c.face,
        dots: shown,
        more: Math.max(0, solid.length - cap),
        mode: c.mode,
        names: this.names(c.ids),
        count: c.ids.length,
        ghost: hollow.length,
      };
    });
  }

  protected passDots(): Dot[] {
    const m = this.store.m();
    const o = this.outcome();
    if (!o) return [];
    const asGhost = this.mode() === 'ghost';
    return o.passes.map((id) => this.dot(m.person(id), id, asGhost)).slice(0, this.cap());
  }

  protected summary(): string {
    const o = this.outcome();
    if (!o) return '';
    const parts = this.cols()
      .filter((c) => c.count)
      .map((c) => `${c.face}: ${c.names.join(', ')}`);
    if (o.passes.length) parts.push(`Pass: ${this.names(o.passes).join(', ')}`);
    return `${this.mode() === 'ghost' ? 'Last time' : 'Votes'}. ${parts.join('; ') || 'none'}`;
  }
}
