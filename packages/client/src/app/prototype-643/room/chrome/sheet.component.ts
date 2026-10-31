/**
 * PROTOTYPE (#643). hn-sheet chrome: drag handle (phone; tap cycles 60 % ↔ 95 %),
 * title, header actions, close. One level only (R-22): the overlays layer
 * renders exactly one of these at a time.
 */
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { ProtoStore } from '../../proto-store';
import { SheetState } from './sheet-state';

@Component({
  selector: 'proto-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    @if (handle()) {
      <button
        type="button"
        class="handle"
        [attr.aria-label]="sheet?.expanded() ? 'Make sheet smaller' : 'Make sheet taller'"
        (click)="cycle()"
      >
        <span aria-hidden="true"></span>
      </button>
    }
    <div class="head">
      <h2 class="title" [id]="titleId()">{{ heading() }}</h2>
      <div class="actions"><ng-content select="[sheet-actions]" /></div>
      <button type="button" class="close" aria-label="Close" (click)="store.close()">
        <ion-icon name="close-outline" aria-hidden="true" />
      </button>
    </div>
    <div class="body">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
    .handle {
      display: none;
      align-self: center;
      width: 64px;
      height: 20px;
      margin-top: var(--hn-space-1);
      background: transparent;
      border: 0;
      cursor: pointer;
      place-items: center;
    }
    .handle span {
      display: block;
      width: 36px;
      height: 5px;
      border-radius: var(--hn-radius-pill);
      background: var(--hn-line-strong);
    }
    @container device (max-width: 599px) {
      .handle {
        display: grid;
      }
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      padding: var(--hn-space-2) var(--hn-space-2) var(--hn-space-2) var(--hn-space-4);
      flex: none;
    }
    .title {
      flex: 1;
      min-width: 0;
      margin: 0;
      font: var(--hn-type-title);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .actions {
      display: flex;
      gap: var(--hn-space-1);
    }
    .close {
      display: inline-grid;
      place-items: center;
      width: var(--hn-tap);
      height: var(--hn-tap);
      border: 0;
      border-radius: var(--hn-radius-md);
      background: transparent;
      color: var(--hn-text);
      font-size: 24px;
      cursor: pointer;
    }
    .body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 0 var(--hn-space-4) var(--hn-space-5);
    }
  `,
})
export class ProtoSheetComponent {
  protected readonly store = inject(ProtoStore);
  readonly heading = input.required<string>();
  readonly titleId = input('proto-sheet-title');
  readonly handle = input(true);
  protected readonly sheet = inject(SheetState, { optional: true });

  protected cycle() {
    this.sheet?.expanded.update((v) => !v);
  }
}
