import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline, syncOutline } from 'ionicons/icons';

import { DocService } from './doc/doc.service';

/**
 * Presentation state for the chip. Kept narrow so the template
 * branches on a single signal; `color` maps directly to Ionic's chip
 * palette without any intermediate translation at render time.
 */
export interface ChipState {
  readonly label: string;
  readonly color: 'medium' | 'warning';
  readonly icon: 'cloud-offline-outline' | 'sync-outline';
  readonly ariaLabel: string;
}

/** The union of status values the chip cares about. */
export type ChipSyncStatus = 'connected' | 'offline' | 'connecting' | 'disconnected';

/**
 * Pure display function for the connection chip.
 * Exported for unit testing — the component's `display` computed delegates here.
 */
export function computeChipDisplay(
  status: ChipSyncStatus,
  disconnectedLongEnough: boolean,
): ChipState | null {
  switch (status) {
    case 'connected':
    case 'offline':
      return null;
    case 'connecting':
      return {
        label: 'Connecting…',
        color: 'medium',
        icon: 'sync-outline',
        ariaLabel: 'Connecting to relay',
      };
    case 'disconnected':
      if (!disconnectedLongEnough) return null;
      return {
        label: 'Reconnecting…',
        color: 'warning',
        icon: 'cloud-offline-outline',
        ariaLabel: 'Disconnected from relay, attempting to reconnect',
      };
  }
}

/**
 * Debounce window for disconnected → warning. Plan §3.9 specifies
 * 5 s: anything briefer is treated as a transit blip and stays
 * invisible so the toolbar doesn't flap during normal network
 * jitter. Exported so other debounce windows (e.g.
 * `HOST_ABSENCE_ELECTION_DEBOUNCE_MS`) can reference the value if
 * needed, though they are intentionally kept as separate constants.
 */
export const DISCONNECTED_WARNING_DELAY_MS = 5_000;

/**
 * Toolbar status chip — plan §3.9.
 *
 * Rules:
 *   - `connected` (or `offline`, pre-connect): nothing rendered.
 *   - `connecting`: subtle "Connecting…" chip in the muted palette.
 *   - `disconnected`: invisible for the first 5 s (to swallow
 *     network blips); after the debounce elapses, becomes a
 *     `warning`-color "Reconnecting…" chip.
 *
 * Rendered inline as an Ionic flavored element; Lobby and Estimating
 * slot it alongside the existing toolbar buttons. Extracting the
 * debounce machinery into one component avoids the alternative of
 * duplicating a setTimeout + signal dance across screens.
 */
@Component({
  selector: 'app-connection-chip',
  imports: [IonChip, IonIcon, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (display(); as chip) {
      <ion-chip
        class="connection-chip"
        [color]="chip.color"
        [attr.aria-label]="chip.ariaLabel"
        aria-live="polite"
      >
        <ion-icon [name]="chip.icon" aria-hidden="true"></ion-icon>
        <ion-label>{{ chip.label }}</ion-label>
      </ion-chip>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
      }
      .connection-chip {
        margin: 0 0.25rem;
        font-size: 0.8rem;
        height: 1.75rem;
      }
      .connection-chip ion-icon {
        font-size: 1rem;
      }
    `,
  ],
})
export class ConnectionChipComponent {
  private readonly docService = inject(DocService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * True once `syncStatus` has been `'disconnected'` continuously for
   * {@link DISCONNECTED_WARNING_DELAY_MS}. Flipped back to `false`
   * the moment the status transitions away; the effect below owns
   * the one outstanding timer handle.
   */
  private readonly disconnectedLongEnough = signal(false);

  protected readonly display = computed<ChipState | null>(() =>
    computeChipDisplay(this.docService.syncStatus(), this.disconnectedLongEnough()),
  );

  constructor() {
    addIcons({
      'cloud-offline-outline': cloudOfflineOutline,
      'sync-outline': syncOutline,
    });

    let timerId: ReturnType<typeof setTimeout> | null = null;

    // A single reactive effect owns the debounce. On every status
    // change we cancel the pending timer and, if the new status is
    // 'disconnected', schedule a fresh one — so a quick
    // connected → disconnected → connected blip leaves
    // `disconnectedLongEnough` at `false` without ever flipping
    // visible.
    effect(() => {
      const status = this.docService.syncStatus();
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (status === 'disconnected') {
        timerId = setTimeout(() => {
          this.disconnectedLongEnough.set(true);
        }, DISCONNECTED_WARNING_DELAY_MS);
      } else {
        this.disconnectedLongEnough.set(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (timerId !== null) clearTimeout(timerId);
    });
  }
}
