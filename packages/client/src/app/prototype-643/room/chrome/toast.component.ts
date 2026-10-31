/**
 * PROTOTYPE (#643). hn-toast: one row, one at a time, non-modal, semantic icon,
 * optional Undo (it only renders undo; the model owns the pending commit, D4).
 * Sits above the action bar, never over the header (UX-061). Also carries the
 * host notices: a hand-off reads as one ("Hana made Ana the host"), an
 * election reads "Hana dropped. Ana is host now" (UX-078). Skip story uses the
 * same verb as the menu and the key (UX-005).
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { ProtoStore } from '../../proto-store';

const ICON = {
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  warning: 'warning-outline',
  danger: 'alert-circle-outline',
} as const;

@Component({
  selector: 'proto-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <div class="slot" role="status" aria-live="polite">
      @if (notice(); as n) {
        <div class="toast" [class]="'toast k-' + n.kind" [attr.data-ux]="ux()">
          <ion-icon [name]="icon()" aria-hidden="true" />
          <span class="text">{{ n.text }}</span>
          @if (n.undoLabel) {
            <button type="button" class="undo" (click)="store.model.undo()">
              <ion-icon name="arrow-undo-outline" aria-hidden="true" />{{ n.undoLabel }}
            </button>
          }
          <button type="button" class="x" aria-label="Dismiss" (click)="store.model.dismissNotice()">
            <ion-icon name="close-outline" aria-hidden="true" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .slot {
      display: flex;
      justify-content: center;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      max-width: min(100%, 480px);
      min-height: 48px;
      padding: var(--hn-space-1) var(--hn-space-1) var(--hn-space-1) var(--hn-space-3);
      border-radius: var(--hn-radius-md);
      background: var(--hn-text);
      color: var(--hn-bg);
      box-shadow: var(--hn-e2);
      font: var(--hn-type-small);
      animation: rise var(--hn-dur-enter) var(--hn-ease-out);
    }
    .toast > ion-icon {
      flex: none;
      font-size: 20px;
    }
    .text {
      flex: 1;
      min-width: 0;
    }
    .undo,
    .x {
      display: inline-flex;
      align-items: center;
      gap: var(--hn-space-1);
      flex: none;
      min-height: var(--hn-tap);
      padding: 0 var(--hn-space-2);
      border: 0;
      border-radius: var(--hn-radius-sm);
      background: transparent;
      color: var(--hn-bg);
      font: var(--hn-type-label);
      cursor: pointer;
    }
    .undo {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .x {
      width: var(--hn-tap);
      justify-content: center;
      font-size: 18px;
      opacity: 0.8;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
})
export class ProtoToastComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly notice = computed(() => this.store.m().state.notices[0]);
  protected readonly icon = computed(() => ICON[this.notice()?.kind ?? 'info']);
  protected readonly ux = computed(() => {
    const t = this.notice()?.text ?? '';
    if (/the host$| is host now/u.test(t)) return 'UX-078 UX-061';
    if (t.startsWith('Skipped') || t.startsWith('Removed')) return 'UX-005 UX-061';
    if (t.startsWith('Added')) return 'UX-021 UX-061';
    return 'UX-061';
  });
}
