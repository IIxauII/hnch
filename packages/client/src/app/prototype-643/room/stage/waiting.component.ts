/**
 * PROTOTYPE (#643). The waiting phase body (§2.1, §6.1):
 *   host alone   → invite panel as the empty state (QR inline on desktop)
 *   host         → "After this · 4" (rows not interactive) + quiet `+ Add`, or the
 *                  story field when the queue is empty (never both, R-09); Scale ▾
 *   voter/viewer → "Waiting for Hana to start…" (status line) + the same list, read-only
 *   queue done   → totals, Copy summary, optional story field
 * Everyone sees the last result: "Last: PROJ-100 Search · Agreed 5".
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, copyOutline, qrCodeOutline, shareOutline } from 'ionicons/icons';

import { RoomModel, SCALES, sessionSummary } from '../../room-model';
import { ProtoStore } from '../../proto-store';
import { lastResultLine } from './stage-ui';

@Component({
  selector: 'proto-stage-waiting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    @let m = store.m();
    @let alone = m.present.length <= 1;
    @let after = m.queue.slice(1);
    @let last = lastResult();
    <div class="waiting" data-ux="UX-016 UX-020">
      @if (m.isHost && alone) {
        <section class="invite" aria-labelledby="invite-h" data-ux="UX-016">
          <h2 id="invite-h" class="visually-hidden">Invite</h2>
          <p class="sub">They join with the link or the code <span class="code tnum">{{ m.state.code }}</span>. This panel goes away when the first person joins.</p>
          <div class="row">
            <button type="button" class="hn-btn secondary" (click)="store.open('invite')">
              <ion-icon name="share-outline" aria-hidden="true" />Share link
            </button>
            @if (!store.isDesktop()) {
              <button type="button" class="hn-btn quiet" (click)="store.open('invite')">
                <ion-icon name="qr-code-outline" aria-hidden="true" />Show QR
              </button>
            }
          </div>
          @if (store.isDesktop()) {
            <svg class="qr" viewBox="0 0 29 29" role="img" aria-label="QR code for the room link" shape-rendering="crispEdges">
              @for (c of qr; track $index) {
                <rect [attr.x]="c[0]" [attr.y]="c[1]" width="1" height="1" />
              }
            </svg>
          }
        </section>
      }

      @if (doneState()) {
        @let sum = summary();
        <section class="done" aria-labelledby="done-h" data-ux="UX-033">
          <h2 id="done-h" class="visually-hidden">Session so far</h2>
          <p class="big">All {{ sum.rows.length }} {{ sum.rows.length === 1 ? 'story' : 'stories' }} estimated · {{ sum.minutes }} min</p>
          <p class="sub tnum">{{ sum.total !== undefined ? sum.total + ' points · ' : '' }}{{ sum.hnchd }} hnch'd{{ m.skipped.length ? ' · ' + m.skipped.length + ' skipped' : '' }}</p>
          <div class="row">
            <button type="button" class="hn-btn secondary" (click)="copySummary()">
              <ion-icon name="copy-outline" aria-hidden="true" />Copy summary
            </button>
          </div>
        </section>
      }

      @if (m.queue.length) {
        <section class="after" aria-labelledby="after-h">
          <div class="after-head">
            <h2 id="after-h" class="label">After this · {{ after.length }}</h2>
            @if (m.isHost) {
              <button type="button" class="hn-btn quiet" (click)="store.open('add-stories')" [attr.title]="fine() ? 'Add stories (+)' : null">
                <ion-icon name="add-outline" aria-hidden="true" />Add
              </button>
            }
          </div>
          @if (after.length) {
            <ul class="rows" role="list">
              @for (s of after.slice(0, 4); track s.id) {
                <li class="story-row"><span class="key">{{ s.key }}</span><span class="t">{{ s.title }}</span></li>
              }
              @if (after.length > 4) {
                <li class="story-row more">+{{ after.length - 4 }} more</li>
              }
            </ul>
          }
        </section>
      } @else if (m.isHost) {
        <div class="field" data-ux="UX-016">
          <label for="story-field" class="visually-hidden">Story title</label>
          <textarea
            #field
            id="story-field"
            class="input"
            rows="1"
            [placeholder]="doneState() ? 'Type or paste a story (optional)' : 'Type or paste a story'"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
            (keydown.enter)="add($event)"
            (keydown.escape)="$any($event.target).blur()"
          ></textarea>
          @if (preview(); as p) {
            <p class="preview">{{ p }} · <span class="hn-kbd">⏎</span> adds</p>
          } @else {
            <p class="preview">Paste many lines to queue many stories. Or just start.</p>
          }
        </div>
      } @else {
        <p class="sub">{{ m.host?.name ?? 'The host' }} hasn't queued stories yet.</p>
      }

      @if (last) {
        <p class="last">{{ last }}</p>
      }

      @if (m.isHost) {
        <label class="scale">
          <span>Scale ·</span>
          <select aria-label="Scale" (change)="m.setScale($any($event.target).value)">
            @for (s of scales; track s.id) {
              <option [value]="s.id" [selected]="s.id === m.state.scaleId">{{ s.label }}</option>
            }
          </select>
        </label>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .waiting {
      display: flex;
      flex-direction: column;
      gap: var(--hn-space-5);
      padding-top: var(--hn-space-2);
    }
    .h2 {
      margin: 0;
      font: var(--hn-type-label);
    }
    .label {
      margin: 0;
      font: var(--hn-type-label);
      color: var(--hn-text-2);
    }
    .sub {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .big {
      margin: 0;
      font: var(--hn-type-label);
    }
    .code {
      font-family: var(--hn-mono);
      color: var(--hn-text);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--hn-space-3);
      align-items: center;
    }
    .invite,
    .done {
      display: grid;
      gap: var(--hn-space-3);
    }
    .qr {
      width: 160px;
      height: 160px;
      padding: var(--hn-space-2);
      background: var(--hn-surface);
      border: 1px solid var(--hn-line);
      border-radius: var(--hn-radius-sm);
      fill: var(--hn-text);
    }
    .after-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .rows {
      list-style: none;
      margin: var(--hn-space-1) 0 0;
      padding: 0;
    }
    .story-row {
      display: flex;
      gap: var(--hn-space-3);
      font: var(--hn-type-small);
      color: var(--hn-text-2);
      padding: var(--hn-space-1) 0;
      white-space: nowrap;
      min-width: 0;
    }
    .story-row .key {
      flex: none;
      color: var(--hn-text-3);
      font-variant-numeric: tabular-nums;
    }
    .story-row .t {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .story-row.more {
      color: var(--hn-text-3);
    }
    .field {
      display: grid;
      gap: var(--hn-space-1);
    }
    .input {
      font: var(--hn-type-body);
      color: var(--hn-text);
      background: var(--hn-surface-2);
      border: 1px solid var(--hn-line-strong);
      border-radius: var(--hn-radius-sm);
      padding: var(--hn-space-3);
      min-height: var(--hn-tap);
      resize: vertical;
    }
    .preview,
    .last {
      margin: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .last {
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .scale {
      display: inline-flex;
      align-items: center;
      gap: var(--hn-space-1);
      font: var(--hn-type-small);
      color: var(--hn-text-2);
      min-height: var(--hn-tap);
    }
    .scale select {
      font: var(--hn-type-label);
      color: var(--hn-accent-text);
      background: transparent;
      border: 0;
      min-height: var(--hn-tap);
      cursor: pointer;
    }
    ion-icon {
      font-size: 20px;
    }
  `,
})
export class ProtoStageWaitingComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly scales = Object.values(SCALES);
  protected readonly draft = signal('');
  protected readonly fine = computed(() => this.store.pointer() === 'fine');
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');
  /** Static pseudo-QR (finder squares + noise): a stand-in for the real code. */
  protected readonly qr = pseudoQr();

  constructor() {
    // autofocus the story field only on fine pointers (CD-15): no keyboard pop on phones
    afterNextRender(() => {
      if (this.store.pointer() === 'fine')
        this.field()?.nativeElement.focus({ preventScroll: true });
    });
    addIcons({ addOutline, copyOutline, qrCodeOutline, shareOutline });
  }

  /** Queue ran out after this session estimated something (PROJ-100 is fixture history from before). */
  protected doneState(): boolean {
    const m = this.store.m();
    return m.queue.length === 0 && m.done.length > 0 && m.done.some((s) => s.id !== 'PROJ-100');
  }

  protected summary() {
    return sessionSummary(this.store.m());
  }

  protected lastResult(): string | undefined {
    return lastResultLine(this.store.m());
  }

  protected preview(): string | undefined {
    const parsed = RoomModel.parseStories(this.draft());
    if (!parsed.length) return undefined;
    const first = parsed[0]!;
    return `${parsed.length} ${parsed.length === 1 ? 'story' : 'stories'} · ${[first.key, first.title].filter(Boolean).join(' ')}${parsed.length > 1 ? ' …' : ''}`;
  }

  protected add(e: Event) {
    const k = e as KeyboardEvent;
    if (k.shiftKey) return; // Shift+Enter keeps a newline
    e.preventDefault();
    const text = this.draft();
    if (!text.trim()) return;
    this.store.model.addStories(text);
    this.draft.set('');
  }

  protected async copySummary() {
    const m = this.store.model;
    try {
      await navigator.clipboard.writeText(sessionSummary(m).text);
      m.notify('Summary copied', 'success');
    } catch {
      m.notify("Couldn't copy here. Select the text instead.", 'warning');
    }
    this.store.bump();
  }
}

function pseudoQr(): [number, number][] {
  const cells: [number, number][] = [];
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (edge || core) cells.push([ox + x, oy + y]);
      }
  };
  finder(0, 0);
  finder(22, 0);
  finder(0, 22);
  let seed = 7;
  for (let y = 0; y < 29; y++)
    for (let x = 0; x < 29; x++) {
      const inFinder = (x < 8 && y < 8) || (x > 20 && y < 8) || (x < 8 && y > 20);
      if (inFinder) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 7 < 3) cells.push([x, y]);
    }
  return cells;
}
