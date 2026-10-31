/**
 * PROTOTYPE (#643). Desktop rail (≥1024, plan §6.2): People · Up next · Done as
 * flat headed lists. No accordion cards (UX-042), no list background bands
 * (UX-063), single-line rows with ellipsis (UX-043, UX-045).
 * During reveal, People becomes "Votes": each person's card, sorted by value,
 * Low/High tagged (CD-08), Pass reads "Pass" (UX-039).
 * Host: an Up next row starts that story (UX-022).
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { ProtoStore } from '../proto-store';
import { PASS } from '../room-model';
import { colourCollisions, ProtoDotComponent } from './chrome/dot.component';
import { registerChromeIcons } from './chrome/icons';
import { orderedPeople, personRow, type PersonRow } from './chrome/people';

@Component({
  selector: 'proto-room-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ProtoDotComponent],
  template: `
    @let m = store.m();
    @let revealed = m.phase === 'revealed';
    @let o = m.outcome;
    <aside class="rail" aria-label="People and stories" data-ux="UX-042 UX-063">
      <section aria-labelledby="rail-people">
        <h2 id="rail-people" class="h">
          @if (revealed) {
            Votes · {{ o?.n ?? 0 }}
          } @else {
            People · {{ voting() }}{{ watching() ? ' + ' + watching() + ' watching' : '' }}
          }
        </h2>
        <ul class="list">
          @for (r of rows(); track r.p.id) {
            <li class="row" data-ux="UX-045">
              <proto-dot size="sm" [person]="r.p" [state]="r.dot" [collision]="collide().has(r.p.id)" />
              <span class="name">{{ r.you ? 'you' : r.p.name }}</span>
              @if (r.host) {
                <span class="badge" data-ux="UX-062">host</span>
              }
              <span class="fill"></span>
              @if (revealed && r.value !== undefined) {
                <span class="val tnum" data-ux="UX-039">{{ r.value }}</span>
                <span class="tag">{{ tagFor(r) }}</span>
              } @else {
                <span class="state">{{ r.state }}</span>
              }
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="rail-next">
        <div class="h-row">
          <h2 id="rail-next" class="h">Up next · {{ m.queue.length }}</h2>
          <button type="button" class="hn-btn quiet" data-ux="UX-064" (click)="store.open('add-stories')">
        + Add
          </button>
        </div>
        @if (m.queue.length === 0) {
          <p class="empty">Nothing queued. Paste a list with + Add.</p>
        }
        <ul class="list">
          @for (s of m.queue; track s.id) {
            <li data-ux="UX-022 UX-043">
              @if (m.isHost && m.phase !== 'voting') {
                <button
                  type="button"
                  class="row story act"
                  [attr.aria-label]="'Start ' + (s.key || s.title) + ' now'"
                  [title]="'Start now'"
                  (click)="m.start(s.id)"
                >
                  <span class="key tnum">{{ s.key }}</span>
                  <span class="name">{{ s.title }}</span>
                </button>
              } @else {
                <span class="row story">
                  <span class="key tnum">{{ s.key }}</span>
                  <span class="name">{{ s.title }}</span>
                </span>
              }
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="rail-done">
        <h2 id="rail-done" class="h">Done · {{ m.done.length }}</h2>
        <ul class="list">
          @for (s of m.done; track s.id) {
            <li class="row story" data-ux="UX-022 UX-004">
              <span class="key tnum">{{ s.key }}</span>
              <span class="name">{{ s.title }}</span>
              <span class="val tnum">{{ s.value ?? '–' }}</span>
              <span class="ok" aria-hidden="true">✓</span><span class="visually-hidden">agreed</span>
            </li>
          }
        </ul>
        @if (m.skipped.length) {
          <h3 class="h sub">Skipped · {{ m.skipped.length }}</h3>
          <ul class="list">
            @for (s of m.skipped; track s.id) {
              <li class="row story muted" data-ux="UX-054">
                <ion-icon name="play-skip-forward-outline" aria-hidden="true" />
                <span class="key tnum">{{ s.key }}</span>
                <span class="name">{{ s.title }}</span>
                <span class="visually-hidden">skipped</span>
              </li>
            }
          </ul>
        }
        <button type="button" class="hn-btn quiet all" (click)="store.open('stories')">
          <ion-icon name="list-outline" aria-hidden="true" />All stories
        </button>
      </section>
    </aside>
  `,
  styles: `
    :host {
      display: block;
    }
    .rail {
      display: grid;
      gap: var(--hn-space-5);
      position: sticky;
      top: calc(var(--hn-header-h) + var(--hn-space-5));
    }
    section {
      display: grid;
      gap: var(--hn-space-1);
    }
    .h {
      margin: 0;
      font: var(--hn-type-label);
      color: var(--hn-text);
    }
    .h.sub {
      margin-top: var(--hn-space-2);
      font: var(--hn-type-caption);
      color: var(--hn-text-2);
    }
    .h-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      background: transparent;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      min-height: 40px;
      width: 100%;
      font: var(--hn-type-small);
      color: var(--hn-text);
      text-align: left;
    }
    button.row {
      background: transparent;
      border: 0;
      border-radius: var(--hn-radius-sm);
      padding: 0 var(--hn-space-1);
      margin: 0 calc(-1 * var(--hn-space-1));
      width: calc(100% + 2 * var(--hn-space-1));
      cursor: pointer;
    }
    button.row:hover {
      background: var(--hn-surface-2);
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row:not(.story) .name {
      flex: 0 1 auto;
    }
    .fill {
      flex: 1;
    }
    .key {
      flex: none;
      width: 72px;
      color: var(--hn-text-3);
      font: var(--hn-type-caption);
    }
    .state {
      flex: none;
      color: var(--hn-text-2);
      font: var(--hn-type-caption);
    }
    .val {
      flex: none;
      min-width: 24px;
      text-align: right;
      font: var(--hn-type-label);
    }
    .tag {
      flex: none;
      width: 32px;
      color: var(--hn-text-3);
      font: var(--hn-type-caption);
    }
    .ok {
      flex: none;
      color: var(--hn-success);
    }
    .muted {
      color: var(--hn-text-2);
    }
    .badge {
      flex: none;
      padding: 0 var(--hn-space-2);
      border-radius: var(--hn-radius-pill);
      border: 1px solid var(--hn-line-strong);
      color: var(--hn-text-2);
      font: var(--hn-type-caption);
    }
    .empty {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .all {
      justify-self: start;
      margin-top: var(--hn-space-2);
    }
  `,
})
export class ProtoRoomRailComponent {
  protected readonly store = inject(ProtoStore);

  constructor() {
    registerChromeIcons();
  }

  protected readonly collide = computed(() => colourCollisions(this.store.m().present));
  protected readonly voting = computed(
    () => this.store.m().present.filter((p) => p.role === 'voter').length,
  );
  protected readonly watching = computed(
    () => this.store.m().present.filter((p) => p.role === 'viewer').length,
  );

  /** People rows; during reveal sorted by card value (scale order), Pass and no-vote last. */
  protected readonly rows = computed<PersonRow[]>(() => {
    const m = this.store.m();
    const rows = orderedPeople(m).map((p) => personRow(m, p));
    if (m.phase !== 'revealed') return rows;
    const cards = m.scale.cards;
    const rank = (r: PersonRow) => {
      const v = m.activeRound?.votes[r.p.id];
      if (v === undefined) return 1000;
      if (v === PASS) return 900;
      const i = cards.indexOf(v);
      return i < 0 ? 800 : i;
    };
    return rows.toSorted((a, b) => rank(a) - rank(b));
  });

  protected tagFor(r: PersonRow): string {
    const o = this.store.m().outcome;
    const v = this.store.m().activeRound?.votes[r.p.id];
    if (!o || v === undefined || v === PASS) return '';
    if (o.low && o.low.value === v) return 'low';
    if (o.high && o.high.value === v) return 'high';
    return '';
  }
}
