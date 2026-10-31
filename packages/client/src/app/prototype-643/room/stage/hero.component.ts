/**
 * PROTOTYPE (#643). hn-hero: the one number (§5.6, §6.1 outcome table).
 *   Agreed / Close / 1 vote → display-size value; Split → "Split · 3–21" (title
 *   size); No votes → "—". Status glyph + word, `avg 8.4` on numeric scales.
 * Agreed (n ≥ 2): a static "✓ hnch'd" stamp (every motion mode) plus a ≤900 ms
 * vector dot burst that never blocks the primary (pointer-events: none) and is
 * not rendered at all under reduced motion (UX-037, UX-075).
 * Host on a coarse pointer: the hero is a button that opens an in-stage row of
 * 44 px value chips (R-36), for decks whose Strip columns are under 44 px.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProtoStore } from '../../proto-store';
import { dotColors, StageUi } from './stage-ui';

@Component({
  selector: 'proto-stage-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = store.m();
    @let o = m.outcome;
    @if (o) {
      @let r = m.activeRound;
      @let pick = r?.hostPick;
      @let v = m.acceptValue;
      @let split = o.kind === 'split' && !pick;
      @let tappable = m.isHost && !fine();
      <div class="hero" data-ux="UX-034 UX-035 UX-036 UX-037">
        @if (tappable) {
          <button
            type="button"
            id="stage-hero"
            class="value-btn"
            [attr.aria-expanded]="ui.chipsOpen()"
            aria-controls="value-chips"
            [attr.aria-label]="heroLabel() + '. Change value'"
            (click)="ui.chipsOpen.set(!ui.chipsOpen())"
          >
            <span class="value tnum" [class.split]="split" aria-hidden="true">{{ valueText() }}</span>
          </button>
        } @else {
          <div id="stage-hero" class="value-box" tabindex="-1" [attr.aria-label]="heroLabel()" role="group">
            <span class="value tnum" [class.split]="split" aria-hidden="true">{{ valueText() }}</span>
          </div>
        }

        <p class="word">
          @if (o.kind === 'agreed' && o.n >= 2) {
            <span class="stamp st-agreed" aria-label="hnch'd, agreed" data-ux="UX-037 UX-075">✓ hnch'd</span>
          } @else if (o.kind === 'one') {
            <span class="st-none">1 vote</span>
          } @else if (!split) {
            <span [class]="'st-' + o.kind">{{ o.glyph }} {{ o.word }}</span>
          }
          @if (o.avg !== undefined && o.kind !== 'none') {
            <span class="avg tnum">avg {{ round1(o.avg) }}</span>
          }
        </p>
        @if (pick) {
          <p class="picked">
            {{ m.isHost ? 'You picked' : m.host?.name + ' picked' }} {{ pick }}{{ o.suggestion ? ' · suggested ' + o.suggestion : '' }}
          </p>
        }

        @if (o.kind === 'agreed' && o.n >= 2 && !store.reducedMotion()) {
          @for (k of [r?.id]; track k) {
            <div class="burst" aria-hidden="true">
              @for (b of burst(); track $index) {
                <i [style.--a]="b.a" [style.--c]="b.c" [style.--d]="b.d"></i>
              }
            </div>
          }
        }
      </div>
      @if (tappable && ui.chipsOpen()) {
        <div id="value-chips" class="chips" role="group" aria-label="Accept another value" data-ux="UX-073">
          @for (c of m.scale.cards; track c) {
            <button
              type="button"
              class="hn-chip chip"
              [attr.aria-pressed]="c === v"
              (click)="m.pick(c); ui.chipsOpen.set(false)"
            >
              {{ c }}
            </button>
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .hero {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--hn-space-2);
      text-align: center;
    }
    .value-btn,
    .value-box {
      appearance: none;
      border: 0;
      background: transparent;
      color: var(--hn-text);
      padding: var(--hn-space-1) var(--hn-space-4);
      border-radius: var(--hn-radius-md);
      min-height: var(--hn-tap);
      min-width: var(--hn-tap);
      cursor: default;
    }
    .value-btn {
      cursor: pointer;
    }
    .value-box:focus {
      outline: none;
    }
    .value-box:focus-visible {
      outline: 2px solid var(--hn-focus);
    }
    .value {
      display: block;
      font: var(--hn-type-display);
      animation: hero-in var(--hn-dur-enter) var(--hn-ease-spring);
    }
    .value.split {
      font: var(--hn-type-title);
      color: var(--hn-warning);
      padding: var(--hn-space-4) 0;
    }
    @keyframes hero-in {
      from {
        transform: scale(0.85);
        opacity: 0;
      }
    }
    .word {
      margin: 0;
      display: flex;
      gap: var(--hn-space-3);
      align-items: baseline;
      font: var(--hn-type-label);
    }
    .avg {
      font: var(--hn-type-small);
      color: var(--hn-text-3);
    }
    .stamp {
      display: inline-block;
      padding: var(--hn-space-1) var(--hn-space-3);
      border-radius: var(--hn-radius-pill);
      border: 2px solid currentColor;
      transform: rotate(-4deg);
      animation: stamp-in var(--hn-dur-enter) var(--hn-ease-spring);
    }
    @keyframes stamp-in {
      from {
        transform: rotate(-4deg) scale(1.4);
        opacity: 0;
      }
    }
    .picked {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-accent-text);
    }
    .burst {
      position: absolute;
      left: 50%;
      top: 32px;
      width: 0;
      height: 0;
      pointer-events: none;
    }
    .burst i {
      position: absolute;
      left: -4px;
      top: -4px;
      width: 8px;
      height: 8px;
      border-radius: var(--hn-radius-pill);
      background: var(--c);
      opacity: 0;
      transform: rotate(var(--a)) translateX(0);
      animation: burst var(--hn-dur-delight) var(--hn-ease-out) forwards;
    }
    @keyframes burst {
      10% {
        opacity: 1;
      }
      to {
        opacity: 0;
        transform: rotate(var(--a)) translateX(var(--d));
      }
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--hn-space-2);
      margin-top: var(--hn-space-2);
    }
    .chip {
      min-height: var(--hn-tap);
      min-width: var(--hn-tap);
      justify-content: center;
      font: var(--hn-type-label);
      cursor: pointer;
    }
    .chip[aria-pressed='true'] {
      background: var(--hn-accent);
      color: var(--hn-on-accent);
    }
  `,
})
export class ProtoStageHeroComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly ui = inject(StageUi);
  protected readonly fine = computed(() => this.store.pointer() === 'fine');

  protected round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  protected valueText(): string {
    const m = this.store.m();
    const o = m.outcome;
    if (!o) return '';
    const pick = m.activeRound?.hostPick;
    if (pick) return pick;
    if (o.kind === 'none') return '—';
    if (o.kind === 'split') return `↔ Split · ${o.min ?? ''}–${o.max ?? ''}`;
    return m.acceptValue ?? '';
  }

  protected heroLabel(): string {
    const m = this.store.m();
    const o = m.outcome;
    if (!o) return '';
    const pick = m.activeRound?.hostPick;
    if (pick) return `${pick}, picked${o.suggestion ? `; suggested ${o.suggestion}` : ''}`;
    if (o.kind === 'none') return 'No votes';
    if (o.kind === 'split') return `Split, ${o.min ?? ''} to ${o.max ?? ''}`;
    if (o.kind === 'agreed') return `${o.suggestion ?? ''}, agreed`;
    if (o.kind === 'one') return `${o.suggestion ?? ''}, 1 vote`;
    return `${o.suggestion ?? ''}, suggested`;
  }

  /** 14 dots in the voters' own colours, radiating out once (≤900 ms). */
  protected burst(): { a: string; c: string; d: string }[] {
    const m = this.store.m();
    const theme = this.store.theme();
    const voters = Object.keys(m.activeRound?.votes ?? {}).map((id) => m.person(id));
    const n = 14;
    return Array.from({ length: n }, (_, i) => ({
      a: `${(360 / n) * i}deg`,
      c: dotColors(voters[i % Math.max(1, voters.length)], theme).bg,
      d: `${72 + (i % 3) * 18}px`,
    }));
  }
}
