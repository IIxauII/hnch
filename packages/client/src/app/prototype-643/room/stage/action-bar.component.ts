/**
 * PROTOTYPE (#643). hn-action-bar: the ONE host primary from `m.primary`, in a
 * fixed slot that never moves (R-06):
 *   phone/tablet  sticky at the bottom of the device, safe-area padding, always
 *                 reachable without a swipe (UX-072)
 *   desktop       the stage's footer row, never wider than the stage (UX-041)
 * Labels: Start · PROJ-101 → Reveal · 3/5 → Accept 8 · Next: PROJ-102 / Re-vote;
 * tonal-disabled "Waiting for votes · 0/5"; disabled "Reconnecting…".
 * Voters and viewers have no action bar. A quiet "Skip story" sits beside it
 * for the host while voting or revealed (in No votes it moves into the stage).
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { playSkipForwardOutline, refreshOutline, syncOutline } from 'ionicons/icons';

import { ProtoStore } from '../../proto-store';
import { runPrimary } from './stage-actions';

@Component({
  selector: 'proto-stage-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    @let m = store.m();
    @let p = m.primary;
    @let showSkip = (m.phase === 'voting' || m.phase === 'revealed') && m.outcome?.kind !== 'none' && !!m.currentStory;
    <footer class="bar" aria-label="Host action" data-ux="UX-072 UX-041 UX-016 UX-017 UX-001 UX-003 UX-033 UX-019 UX-074">
      <button
        type="button"
        id="stage-primary"
        class="hn-btn primary primary-btn"
        [disabled]="!p.enabled"
        aria-keyshortcuts="Enter"
        [attr.title]="fine() ? p.label + ' (⏎)' : null"
        (click)="run()"
      >
        @if (p.label === 'Reconnecting…') {
          <ion-icon name="sync-outline" aria-hidden="true" />
        }
        <span class="label">{{ p.label }}</span>
        @if (p.enabled) {
          <span class="hn-kbd" aria-hidden="true">⏎</span>
        }
      </button>
      <div class="side">
      @if (m.phase === 'revealed' && p.action !== 'revote') {
        <button
          type="button"
          class="hn-btn quiet"
          aria-keyshortcuts="r"
          [attr.title]="fine() ? 'Re-vote (r)' : null"
          (click)="m.revote()"
        >
          <ion-icon name="refresh-outline" aria-hidden="true" />Re-vote
        </button>
      }
      <button
        type="button"
        class="hn-btn quiet skip"
        [class.off]="!showSkip"
        [attr.aria-hidden]="showSkip ? null : 'true'"
        [attr.tabindex]="showSkip ? null : -1"
        [attr.title]="fine() ? 'Skip story (s) · undo for 5 s' : null"
        aria-keyshortcuts="s"
        (click)="m.skip()"
      >
        <ion-icon name="play-skip-forward-outline" aria-hidden="true" />Skip story
      </button>
      </div>
    </footer>
  `,
  styles: `
    :host {
      display: block;
      position: sticky;
      bottom: 0;
      z-index: 2;
    }
    .bar {
      display: flex;
      flex-direction: column-reverse;
      gap: var(--hn-space-1);
      padding: var(--hn-space-3) var(--hn-space-4) calc(var(--hn-space-3) + env(safe-area-inset-bottom, 0px));
      background: var(--hn-bg);
      border-top: 1px solid var(--hn-line);
    }
    .primary-btn {
      width: 100%;
      min-height: var(--hn-action-h);
    }
    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    /* phone/tablet: one row, the primary only (Skip story is in ⋯ and in the revealed stage) */
    .side {
      display: none;
    }
    .skip {
      min-height: var(--hn-tap);
    }
    ion-icon {
      font-size: 20px;
    }
    /* phone: Skip story sits in a quiet row above the primary only while voting / revealed */
    @container device (min-width: 1024px) {
      :host {
        position: sticky;
      }
      .bar {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: var(--hn-space-4) 0 0;
        margin-top: var(--hn-space-4);
        background: var(--hn-surface);
        border-top: 1px solid var(--hn-line);
      }
      .side {
        display: flex;
        gap: var(--hn-space-2);
      }
      .skip.off {
        display: inline-flex;
        visibility: hidden;
      }
      .primary-btn {
        width: auto;
        min-width: 280px;
        max-width: 100%;
        justify-content: space-between;
        padding: 0 var(--hn-space-5);
      }
    }
  `,
})
export class ProtoStageActionBarComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly fine = computed(() => this.store.pointer() === 'fine');

  constructor() {
    addIcons({ playSkipForwardOutline, refreshOutline, syncOutline });
  }

  protected run() {
    runPrimary(this.store.model);
  }
}
