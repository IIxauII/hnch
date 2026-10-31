/**
 * PROTOTYPE (#643). hn-paste-box (UX-021): one line per story, `KEY-123 Title`
 * parsed, live preview, autofocus on fine pointers only, Enter adds a single
 * line, ⌘/Ctrl + Enter adds many, one "Undo paste" toast per batch.
 * Validation only after a submit attempt; nothing is announced on open.
 * Prefill for scenes: store.entry()['addStoriesDraft'].
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { ProtoStore } from '../../proto-store';
import { RoomModel } from '../../room-model';
import { ProtoSheetComponent } from './sheet.component';

@Component({
  selector: 'proto-add-stories-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ProtoSheetComponent],
  template: `
    <proto-sheet heading="Add stories" titleId="ov-title">
      <div class="box" data-ux="UX-021 UX-064">
        <label for="paste" class="lbl">One story per line. "PROJ-101 Title" keeps the key.</label>
        <textarea
          #ta
          id="paste"
          rows="5"
          placeholder="Type or paste stories"
          aria-describedby="paste-preview paste-hint"
          [value]="text()"
          (input)="text.set(ta.value); tried.set(false)"
          (keydown)="onKey($event)"
        ></textarea>
        <p id="paste-hint" class="hint">
          @if (fine()) {
            <span class="hn-kbd">⏎</span> adds one line · <span class="hn-kbd">⌘</span
            ><span class="hn-kbd">⏎</span> adds them all
          } @else {
            Paste a list from Jira, Linear or a doc: every line becomes a story.
          }
        </p>
        <div id="paste-preview" class="preview" aria-live="polite">
          @if (parsed().length) {
            <p class="count">
              {{ parsed().length }} {{ parsed().length === 1 ? 'story' : 'stories' }}
            </p>
            <ul>
              @for (p of shown(); track $index) {
                <li>
                  <span class="key tnum">{{ p.key }}</span>
                  <span class="title">{{ p.title }}</span>
                </li>
              }
            </ul>
            @if (parsed().length > shown().length) {
              <p class="more">+{{ parsed().length - shown().length }} more</p>
            }
          } @else if (tried()) {
            <p class="err">Type or paste at least one story.</p>
          }
        </div>
        <button type="button" class="hn-btn primary block" (click)="add()">
          <ion-icon name="add-outline" aria-hidden="true" />{{ addLabel() }}
        </button>
      </div>
    </proto-sheet>
  `,
  styles: `
    .box {
      display: grid;
      gap: var(--hn-space-3);
    }
    .lbl {
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    textarea {
      width: 100%;
      min-height: 120px;
      padding: var(--hn-space-3);
      border: 1px solid var(--hn-line-strong);
      border-radius: var(--hn-radius-md);
      background: var(--hn-surface);
      color: var(--hn-text);
      font: var(--hn-type-body);
      resize: vertical;
    }
    .hint {
      margin: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .preview ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .preview li {
      display: flex;
      gap: var(--hn-space-2);
      min-height: 32px;
      align-items: center;
      font: var(--hn-type-small);
    }
    .count {
      margin: 0 0 var(--hn-space-1);
      font: var(--hn-type-label);
    }
    .key {
      flex: none;
      width: 76px;
      color: var(--hn-text-3);
      font: var(--hn-type-caption);
    }
    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .more,
    .err {
      margin: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-2);
    }
    .err {
      color: var(--hn-danger);
    }
  `,
})
export class ProtoAddStoriesSheetComponent {
  protected readonly store = inject(ProtoStore);
  private readonly ta = viewChild<ElementRef<HTMLTextAreaElement>>('ta');

  protected readonly text = signal(String(this.store.entry()['addStoriesDraft'] ?? ''));
  protected readonly tried = signal(false);
  protected readonly fine = computed(() => this.store.pointer() === 'fine');
  protected readonly parsed = computed(() => RoomModel.parseStories(this.text()));
  protected readonly shown = computed(() => this.parsed().slice(0, 5));
  protected readonly addLabel = computed(() => {
    const n = this.parsed().length;
    return n > 1 ? `Add ${n} stories` : 'Add story';
  });

  constructor() {
    // autofocus only on fine pointers: on touch it would throw the keyboard up uninvited
    afterNextRender(() => {
      if (this.fine()) this.ta()?.nativeElement.focus();
    });
  }

  protected onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const many = e.metaKey || e.ctrlKey;
    const singleLine = !this.text().includes('\n');
    if (many || (singleLine && !e.shiftKey)) {
      e.preventDefault();
      this.add();
    }
  }

  protected add() {
    if (!this.parsed().length) {
      this.tried.set(true);
      return;
    }
    this.store.model.addStories(this.text());
    this.store.setEntry({ addStoriesDraft: '' });
    this.store.close();
  }
}
