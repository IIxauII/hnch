/**
 * PROTOTYPE (#643). hn-deck + hn-card-tile (§5.6, UX-067, UX-050, UX-023).
 * Native <button aria-pressed> tiles, one tab stop (roving tabindex), arrows
 * move, Space/Enter cast. One face size per deck. Phone: 4 columns (5 above 9
 * faces), 3:4 tiles (1:1 above 9). Desktop: fixed tile width, centred rows, so
 * no ragged grid (UX-041). Pass sits apart. Re-tapping the selected card keeps
 * the vote; "Clear vote" is explicit and undoable.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

import { PASS } from '../../room-model';
import { ProtoStore } from '../../proto-store';
import { faceSize, keycapFor, StageUi } from './stage-ui';

@Component({
  selector: 'proto-stage-deck',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    @let m = store.m();
    @let cards = m.scale.cards;
    @let mine = m.activeRound?.votes?.[m.state.selfId];
    @let pend = ui.pending();
    @let letters = !m.scale.numeric;
    <section class="deck-wrap" aria-labelledby="deck-h" data-ux="UX-067 UX-050 UX-023 UX-041 UX-073 UX-018 UX-074">
      <h2 id="deck-h" class="visually-hidden">Your card</h2>
      <div
        class="deck"
        role="group"
        aria-label="Cards"
        [class.many]="cards.length > 9"
        [attr.data-size]="size()"
        (keydown)="onKey($event)"
      >
        @for (c of cards; track c; let i = $index) {
          @let cap = letters ? keycapFor(cards, c) : undefined;
          <button
            type="button"
            class="tile"
            data-tile
            [attr.aria-pressed]="mine === c"
            [attr.tabindex]="i === focusIdx() ? 0 : -1"
            [class.pending]="!!pend && c.toLowerCase().startsWith(pend.toLowerCase())"
            [attr.title]="fine() ? 'Vote ' + c + (cap ? ' (type ' + cap + ')' : '') : null"
            (click)="vote(c, i)"
          >
            <span class="face">{{ c }}</span>
            @if (pend && c.toLowerCase() === pend.toLowerCase()) {
              <span class="typing" aria-hidden="true">typing…</span>
            } @else if (cap) {
              <span class="hn-kbd cap" aria-hidden="true">{{ cap }}</span>
            }
          </button>
        }
      </div>
      <div class="pass-row">
        <button
          type="button"
          class="tile pass"
          data-tile
          aria-describedby="pass-desc"
          [attr.aria-pressed]="mine === PASS"
          [attr.tabindex]="cards.length === focusIdx() ? 0 : -1"
          [attr.title]="fine() ? 'Pass (-)' : null"
          (click)="vote(PASS, cards.length)"
          (keydown)="onKey($event)"
        >
          <span class="face">Pass</span>
          <span class="hn-kbd cap" aria-hidden="true">-</span>
        </button>
        <span id="pass-desc" class="pass-desc">Sit this one out — doesn't count</span>
        <button
          type="button"
          class="hn-btn quiet clear"
          [style.visibility]="mine ? 'visible' : 'hidden'"
          [attr.title]="fine() ? 'Clear vote (⌫)' : null"
          (click)="m.clearVote()"
        >
          <ion-icon name="close-outline" aria-hidden="true" />Clear vote
        </button>
      </div>
      @if (fine()) {
        <p class="keys-hint">
          @if (letters) {
            Type the letters on a card · <span class="hn-kbd">-</span> pass · <span class="hn-kbd">⌫</span> clear ·
            <span class="hn-kbd">?</span> keys
          } @else {
            Type the number to vote · <span class="hn-kbd">-</span> pass · <span class="hn-kbd">⌫</span> clear ·
            <span class="hn-kbd">?</span> keys
          }
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .deck {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--hn-space-2);
    }
    .deck.many {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .tile {
      position: relative;
      aspect-ratio: 3 / 4;
      min-height: var(--hn-tap);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--hn-space-1);
      border-radius: var(--hn-radius-md);
      border: 2px solid transparent;
      background: var(--hn-surface-2);
      color: var(--hn-text);
      box-shadow: var(--hn-e1);
      cursor: pointer;
      padding: 0;
      font: var(--hn-type-numeral);
      font-variant-numeric: tabular-nums;
      transition:
        transform var(--hn-dur-press) var(--hn-ease-spring),
        background-color var(--hn-dur-state) var(--hn-ease-std),
        border-color var(--hn-dur-state) var(--hn-ease-std);
    }
    .many .tile {
      aspect-ratio: 1 / 1;
    }
    .deck[data-size='headline'] .tile {
      font: var(--hn-type-headline);
    }
    .deck[data-size='label'] .tile {
      font: var(--hn-type-label);
    }
    .tile:active {
      transform: scale(0.97);
    }
    /* selected: accent fill + white numeral (UX-050) + 2 px accent-text ring + 4 px lift */
    .tile[aria-pressed='true'] {
      background: var(--hn-accent);
      color: var(--hn-on-accent);
      border-color: var(--hn-accent-text);
      box-shadow:
        0 0 0 2px var(--hn-accent-text),
        var(--hn-e1);
      transform: translateY(-4px);
    }
    .tile[aria-pressed='true'] .hn-kbd {
      color: var(--hn-on-accent-2);
    }
    /* typing buffer: dashed line-strong border + "typing…" (R-17) */
    .tile.pending {
      border-style: dashed;
      border-color: var(--hn-line-strong);
    }
    .typing,
    .cap {
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
      white-space: nowrap;
    }
    .cap {
      color: inherit;
    }
    .pass-row {
      display: flex;
      align-items: center;
      gap: var(--hn-space-3);
      margin-top: var(--hn-space-3);
    }
    .tile.pass {
      flex: none;
      width: calc((100% - 3 * var(--hn-space-2)) / 4);
      aspect-ratio: auto;
      min-height: 52px;
      font: var(--hn-type-label);
    }
    .tile.pass .cap {
      display: none;
    }
    .pass-desc {
      flex: 1;
      min-width: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .clear {
      flex: none;
    }
    .clear ion-icon {
      font-size: 20px;
    }
    .keys-hint {
      margin: var(--hn-space-3) 0 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    @container device (min-width: 1024px) {
      /* fixed tile width, centred: never a ragged grid (UX-041) */
      .deck,
      .deck.many {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-start;
      }
      .tile {
        width: var(--hn-tile-w);
        aspect-ratio: 3 / 4;
      }
      .deck[data-size='label'] .tile {
        width: calc(var(--hn-tile-w) * 1.5);
      }
      .tile.pass {
        width: calc(var(--hn-tile-w) * 1.25);
        min-height: 0;
        aspect-ratio: auto;
        height: var(--hn-action-h);
      }
      .tile.pass .cap {
        display: inline-block;
      }
      .tile.pass {
        flex-direction: row;
      }
    }
  `,
})
export class ProtoStageDeckComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly ui = inject(StageUi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly PASS = PASS;
  protected readonly keycapFor = keycapFor;
  protected readonly fine = computed(() => this.store.pointer() === 'fine');
  /** Arrow position, scoped to the round it was set in. */
  private readonly moved = signal<{ round: string; i: number } | null>(null);

  protected readonly size = computed(() => faceSize(this.store.m().scale.cards));

  /** Roving tab stop: the last arrow position, else the selected card, else the first. */
  protected readonly focusIdx = computed(() => {
    const m = this.store.m();
    const moved = this.moved();
    if (moved && moved.round === m.activeRound?.id) return moved.i;
    const mine = m.activeRound?.votes[m.state.selfId];
    if (mine === PASS) return m.scale.cards.length;
    const i = mine ? m.scale.cards.indexOf(mine) : -1;
    return i >= 0 ? i : 0;
  });

  private setMoved(i: number) {
    this.moved.set({ round: this.store.model.activeRound?.id ?? '', i });
  }

  protected vote(face: string, i: number) {
    this.setMoved(i);
    // UX-023: re-tapping the selected card keeps the vote (the model ignores it)
    this.store.model.vote(face);
  }

  protected onKey(e: KeyboardEvent) {
    const tiles = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-tile]'));
    const cur = tiles.indexOf(e.target as HTMLElement);
    if (cur < 0) return;
    let next = cur;
    const cols = this.columns(tiles);
    switch (e.key) {
      case 'ArrowRight':
        next = cur + 1;
        break;
      case 'ArrowLeft':
        next = cur - 1;
        break;
      case 'ArrowDown':
        next = cur + cols;
        break;
      case 'ArrowUp':
        next = cur - cols;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tiles.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    next = Math.max(0, Math.min(tiles.length - 1, next));
    this.setMoved(next);
    tiles[next]?.focus();
  }

  /** Tiles per row, read from layout (phone grid or desktop wrap). */
  private columns(tiles: HTMLElement[]): number {
    const top = tiles[0]?.offsetTop ?? 0;
    const n = tiles.findIndex((t) => t.offsetTop !== top);
    return n > 0 ? n : tiles.length;
  }

  constructor() {
    addIcons({ closeOutline });
  }
}
