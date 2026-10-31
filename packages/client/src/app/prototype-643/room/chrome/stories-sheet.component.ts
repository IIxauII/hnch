/**
 * PROTOTYPE (#643). Stories (old Agenda), the session backbone (UX-022):
 * Now · Up next (host: tap = start now; ⋮ Do next / Edit / Remove with Undo) ·
 * Done (agreed values; ⋮ Edit title / Change value) · Skipped (Bring back).
 * Rows: stable columns, one ⋮, single line with ellipsis (UX-043). Skipped rows
 * carry the play-skip-forward glyph + word (UX-054). History comes from
 * m.done / m.history, so discarded rounds never show (UX-004), and a tally
 * reads "Pass", never the raw sentinel (UX-039). One "+ Add" (UX-064).
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';

import { ProtoStore } from '../../proto-store';
import { PASS, type Round, SCALES, type Story } from '../../room-model';
import { ProtoSheetComponent } from './sheet.component';

type Mode = 'menu' | 'edit' | 'value';

@Component({
  selector: 'proto-stories-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, NgTemplateOutlet, ProtoSheetComponent],
  template: `
    @let m = store.m();
    @let host = m.isHost;
    <proto-sheet heading="Stories" titleId="ov-title">
      <button
        sheet-actions
        type="button"
        class="hn-btn quiet"
        data-ux="UX-064"
        (click)="store.open('add-stories')"
      >
        + Add
      </button>

      <div class="wrap" data-ux="UX-022">
        @if (m.currentStory; as now) {
          <section aria-labelledby="st-now">
            <h3 id="st-now" class="h">Now</h3>
            <div class="row">
              <span class="key tnum">{{ now.key }}</span>
              <span class="title">{{ now.title }}</span>
              <span class="val">{{ m.phase === 'voting' ? 'voting' : 'revealed' }}</span>
            </div>
          </section>
        }

        <section aria-labelledby="st-next">
          <h3 id="st-next" class="h">Up next · {{ m.queue.length }}</h3>
          @if (!m.queue.length) {
            <p class="empty">Nothing queued. Use + Add to paste a list.</p>
          }
          <ul class="list" data-ux="UX-043">
            @for (s of m.queue; track s.id) {
              <li>
                <div class="row">
                  @if (host) {
                    <button
                      type="button"
                      class="main"
                      [attr.aria-label]="'Start ' + (s.key || s.title) + ' now'"
                      (click)="startNow(s)"
                    >
                      <span class="key tnum">{{ s.key }}</span>
                      <span class="title">{{ s.title }}</span>
                    </button>
                    <button
                      type="button"
                      class="more"
                      [attr.aria-label]="'Actions for ' + (s.key || s.title)"
                      [attr.aria-expanded]="isOpen(s.id)"
                      (click)="toggle(s.id, 'menu')"
                    >
                      <ion-icon name="ellipsis-vertical" aria-hidden="true" />
                    </button>
                  } @else {
                    <span class="key tnum">{{ s.key }}</span>
                    <span class="title">{{ s.title }}</span>
                  }
                </div>
                @if (isOpen(s.id)) {
                  <div class="acts">
                    @if (mode() === 'edit') {
                      <ng-container *ngTemplateOutlet="edit; context: { $implicit: s }" />
                    } @else {
                      <button type="button" class="hn-btn quiet" (click)="doNext(s)">Do next</button>
                      <button type="button" class="hn-btn quiet" (click)="mode.set('edit')">
                        <ion-icon name="create-outline" aria-hidden="true" />Edit
                      </button>
                      <button type="button" class="hn-btn danger-quiet" (click)="remove(s)">
                        <ion-icon name="close-outline" aria-hidden="true" />Remove
                      </button>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        </section>

        <section aria-labelledby="st-done">
          <h3 id="st-done" class="h">Done · {{ m.done.length }}</h3>
          <ul class="list" data-ux="UX-004">
            @for (s of m.done; track s.id) {
              <li>
                <div class="row">
                  <span class="key tnum">{{ s.key }}</span>
                  <span class="title">{{ s.title }}</span>
                  <span class="val tnum">{{ s.value ?? '–' }}</span>
                  @if (host) {
                    <button
                      type="button"
                      class="more"
                      [attr.aria-label]="'Actions for ' + (s.key || s.title)"
                      [attr.aria-expanded]="isOpen(s.id)"
                      (click)="toggle(s.id, 'menu')"
                    >
                      <ion-icon name="ellipsis-vertical" aria-hidden="true" />
                    </button>
                  }
                </div>
                @if (tally(s.id); as t) {
                  <p class="tally tnum" data-ux="UX-039">{{ t }}</p>
                }
                @if (isOpen(s.id)) {
                  <div class="acts">
                    @switch (mode()) {
                      @case ('edit') {
                        <ng-container *ngTemplateOutlet="edit; context: { $implicit: s }" />
                      }
                      @case ('value') {
                        <div class="chips" role="group" [attr.aria-label]="'New value for ' + (s.key || s.title)">
                          @for (c of cardsFor(s.id); track c) {
                            <button
                              type="button"
                              class="hn-chip"
                              [attr.aria-pressed]="c === s.value"
                              (click)="setValue(s, c)"
                            >
                              {{ c }}
                            </button>
                          }
                        </div>
                      }
                      @default {
                        <button type="button" class="hn-btn quiet" (click)="mode.set('edit')">
                          <ion-icon name="create-outline" aria-hidden="true" />Edit title
                        </button>
                        <button type="button" class="hn-btn quiet" (click)="mode.set('value')">
                          Change value
                        </button>
                      }
                    }
                  </div>
                }
              </li>
            }
          </ul>
        </section>

        @if (m.skipped.length) {
          <section aria-labelledby="st-skip">
            <h3 id="st-skip" class="h">Skipped · {{ m.skipped.length }}</h3>
            <ul class="list" data-ux="UX-054">
              @for (s of m.skipped; track s.id) {
                <li>
                  <div class="row muted">
                    <span class="key tnum">{{ s.key }}</span>
                    <span class="title">{{ s.title }}</span>
                    <span class="val skipped">
                      <ion-icon name="play-skip-forward-outline" aria-hidden="true" />Skipped
                    </span>
                    @if (host) {
                      <button type="button" class="hn-btn quiet" (click)="m.bringBack(s.id)">
                        Bring back
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </proto-sheet>

    <ng-template #edit let-s>
      <label class="edit">
        <span class="visually-hidden">Title of {{ s.key || 'this story' }}</span>
        <input
          #t
          type="text"
          [value]="s.title"
          (keydown.enter)="saveTitle(s, t.value)"
          (keydown.escape)="$event.stopPropagation(); close()"
        />
      </label>
      <button type="button" class="hn-btn secondary" (click)="saveTitle(s, t.value)">Save</button>
    </ng-template>
  `,
  styles: `
    .wrap {
      display: grid;
      gap: var(--hn-space-5);
    }
    section {
      display: grid;
      gap: var(--hn-space-1);
    }
    .h {
      margin: 0;
      font: var(--hn-type-label);
      color: var(--hn-text-2);
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li + li {
      border-top: 1px solid var(--hn-line);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      min-height: 48px;
      font: var(--hn-type-body);
    }
    .main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      min-height: var(--hn-tap);
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .key {
      flex: none;
      width: 76px;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .val {
      flex: none;
      min-width: 28px;
      text-align: right;
      font: var(--hn-type-label);
    }
    .val.skipped {
      display: inline-flex;
      align-items: center;
      gap: var(--hn-space-1);
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .muted .title {
      color: var(--hn-text-2);
    }
    .more {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: var(--hn-tap);
      height: var(--hn-tap);
      border: 0;
      border-radius: var(--hn-radius-md);
      background: transparent;
      color: var(--hn-text);
      font-size: 20px;
      cursor: pointer;
    }
    .tally {
      margin: calc(-1 * var(--hn-space-2)) 0 var(--hn-space-2) 84px;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .acts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--hn-space-2);
      padding: 0 0 var(--hn-space-3) 84px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--hn-space-2);
    }
    .hn-chip {
      cursor: pointer;
      min-width: var(--hn-tap);
      justify-content: center;
    }
    .hn-chip[aria-pressed='true'] {
      background: var(--hn-accent);
      color: var(--hn-on-accent);
    }
    .empty {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .edit input {
      min-height: var(--hn-tap);
      width: 220px;
      max-width: 100%;
      padding: 0 var(--hn-space-3);
      border: 1px solid var(--hn-line-strong);
      border-radius: var(--hn-radius-md);
      background: var(--hn-surface);
      color: var(--hn-text);
      font: var(--hn-type-body);
    }
    @container device (max-width: 599px) {
      .tally,
      .acts {
        padding-left: 0;
        margin-left: 0;
      }
    }
  `,
})
export class ProtoStoriesSheetComponent {
  protected readonly store = inject(ProtoStore);
  private readonly openId = signal<string | null>(null);
  protected readonly mode = signal<Mode>('menu');

  /** Revealed, non-discarded rounds per story (m.history: UX-004). */
  private readonly lastRoundByStory = computed(() => {
    const map = new Map<string, Round>();
    for (const r of this.store.m().history) if (r.storyId) map.set(r.storyId, r);
    return map;
  });

  protected isOpen(id: string): boolean {
    return this.openId() === id;
  }
  protected toggle(id: string, mode: Mode) {
    this.mode.set(mode);
    this.openId.update((v) => (v === id ? null : id));
  }
  protected close() {
    this.openId.set(null);
    this.mode.set('menu');
  }

  /** "5 ×3 · 8 ×1 · Pass ×1": the tally of the round that decided the story. */
  protected tally(storyId: string): string {
    const r = this.lastRoundByStory().get(storyId);
    if (!r) return '';
    const counts = new Map<string, number>();
    for (const v of Object.values(r.votes)) counts.set(v, (counts.get(v) ?? 0) + 1);
    const pass = counts.get(PASS);
    counts.delete(PASS);
    const parts = [...counts.entries()].map(([v, n]) => `${v} ×${n}`);
    if (pass) parts.push(`Pass ×${pass}`);
    return parts.length ? `Votes: ${parts.join(' · ')}` : '';
  }
  protected cardsFor(storyId: string): string[] {
    const r = this.lastRoundByStory().get(storyId);
    return (SCALES[r?.scaleId ?? this.store.m().state.scaleId] ?? SCALES['fibonacci']!).cards;
  }

  protected startNow(s: Story) {
    const m = this.store.model;
    m.start(s.id);
    if (m.currentStory?.id === s.id) this.store.close();
  }
  protected doNext(s: Story) {
    this.close();
    this.store.model.doNext(s.id);
  }
  protected remove(s: Story) {
    this.close();
    this.store.model.removeStory(s.id);
  }
  protected saveTitle(s: Story, v: string) {
    const t = v.trim();
    if (t) this.store.model.editTitle(s.id, t);
    this.close();
  }
  protected setValue(s: Story, v: string) {
    this.store.model.changeValue(s.id, v);
    this.store.model.notify(`${s.key || s.title} → ${v}`, 'success');
    this.store.bump();
    this.close();
  }
}
