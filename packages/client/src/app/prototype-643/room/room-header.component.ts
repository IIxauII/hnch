/**
 * PROTOTYPE (#643). hn-room-header (plan §5.6, §6.1, §6.2), 52 px:
 *   ‹ step out · "Sprint 42 · K7P-9MR" (opens Invite) · status dot · people stack · ⋯
 * - The session name is shown here (UX-080); the code is metadata, not the hero.
 * - The ONE place for connection messaging: no chip, no banner stack (UX-061).
 * - No Voter/Observer chip here: "Just watching" lives in People / ⋯ (UX-069).
 * - Below 360 px the share glyph hides and the stack shows 2 dots + count (UX-045).
 * - Desktop: People are in the rail, so the right side shows you (opens Profile).
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { ProtoStore } from '../proto-store';
import { back } from './chrome/actions';
import { colourCollisions, ProtoDotComponent } from './chrome/dot.component';
import { registerChromeIcons } from './chrome/icons';
import { orderedPeople, peopleSummary } from './chrome/people';

@Component({
  selector: 'proto-room-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ProtoDotComponent],
  template: `
    @let m = store.m();
    @let conn = m.state.connection;
    @let stepOut = m.state.decisions.back === 'step-out';
    <header class="hdr" aria-label="Room">
      <div class="row">
        <button
          type="button"
          class="icon-btn"
          data-ux="UX-002 UX-032"
          [attr.aria-label]="stepOut ? 'Step out to Home. You stay in ' + m.state.name : 'Leave ' + m.state.name"
          [attr.title]="stepOut ? 'Step out (you stay in the room)' : 'Leave'"
          (click)="onBack()"
        >
          <ion-icon name="chevron-back-outline" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="title"
          data-ux="UX-080 UX-029"
          [attr.aria-label]="'Invite to ' + m.state.name + ', code ' + m.state.code"
          (click)="store.open('invite')"
        >
          <span class="name">{{ m.state.name }}</span>
          <span class="sep" aria-hidden="true">·</span>
          <span class="code tnum">{{ m.state.code }}</span>
          <ion-icon class="share" name="share-outline" aria-hidden="true" />
          <span class="invite-word" aria-hidden="true">Invite</span>
        </button>

        <span class="spacer"></span>

        <span
          class="conn"
          role="status"
          aria-live="polite"
          data-ux="UX-061"
          [class.live]="conn === 'live'"
          [class.warn]="conn !== 'live'"
          [attr.title]="connTitle()"
        >
          @switch (conn) {
            @case ('live') {
              <span aria-hidden="true">●</span><span class="visually-hidden">Connected</span>
            }
            @case ('reconnecting') {
              <span aria-hidden="true">◌</span><span class="conn-word">Reconnecting…</span>
            }
            @case ('offline') {
              <span aria-hidden="true">✗</span><span class="conn-word">Offline · your vote will sync</span>
            }
          }
        </span>

        <button
          type="button"
          class="stack"
          data-ux="UX-045 UX-057"
          [attr.aria-label]="'People: ' + summary() + '. Open People'"
          (click)="store.open('people')"
        >
          @for (p of stack(); track p.id; let i = $index) {
            <proto-dot
              class="stack-dot"
              [class.d3]="i === 2"
              [class.d4]="i === 3"
              size="sm"
              [person]="p"
              [collision]="collide().has(p.id)"
              [state]="p.online && !p.steppedOut ? null : 'away'"
            />
          }
          @if (more(4) > 0) {
            <span class="count c4 tnum" aria-hidden="true">+{{ more(4) }}</span>
          }
          @if (more(3) > 0) {
            <span class="count c3 tnum" aria-hidden="true">+{{ more(3) }}</span>
          }
          @if (more(2) > 0) {
            <span class="count c2 tnum" aria-hidden="true">+{{ more(2) }}</span>
          }
        </button>

        @if (m.self; as me) {
          <button
            type="button"
            class="me"
            data-ux="UX-062 UX-079"
            [attr.aria-label]="'Profile: ' + me.name + (m.isHost ? ', host' : '')"
            (click)="store.open('profile')"
          >
            <proto-dot size="sm" [person]="me" />
            <span class="me-name">{{ me.name }}</span>
            @if (m.isHost) {
              <span class="badge">host</span>
            }
          </button>
        }

        <button
          type="button"
          class="icon-btn"
          aria-label="Room menu"
          aria-haspopup="dialog"
          data-ux="UX-056"
          [attr.aria-expanded]="store.overlay() === 'menu'"
          (click)="store.open('menu')"
        >
          <ion-icon name="ellipsis-horizontal" aria-hidden="true" />
        </button>
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 30;
    }
    .hdr {
      background: var(--hn-bg);
      border-bottom: 1px solid var(--hn-line);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--hn-space-1);
      height: var(--hn-header-h);
      padding: 0 var(--hn-space-1);
      max-width: var(--hn-frame-max);
      margin: 0 auto;
    }
    button {
      font: inherit;
      color: inherit;
      background: transparent;
      border: 0;
      cursor: pointer;
      border-radius: var(--hn-radius-md);
    }
    .icon-btn {
      display: inline-grid;
      place-items: center;
      width: var(--hn-tap);
      height: var(--hn-tap);
      flex: none;
      color: var(--hn-text);
      font-size: 24px;
    }
    .title {
      display: inline-flex;
      align-items: center;
      gap: var(--hn-space-1);
      min-width: 0;
      height: var(--hn-tap);
      padding: 0 var(--hn-space-1);
      font: var(--hn-type-label);
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .sep,
    .code {
      flex: none;
      color: var(--hn-text-2);
    }
    .share {
      flex: none;
      font-size: 18px;
      color: var(--hn-accent-text);
    }
    .invite-word {
      display: none;
      color: var(--hn-accent-text);
    }
    .spacer {
      flex: 1;
    }
    .conn {
      display: inline-flex;
      align-items: center;
      gap: var(--hn-space-1);
      flex: none;
      padding: 0 var(--hn-space-1);
      font: var(--hn-type-caption);
      white-space: nowrap;
    }
    .conn.live {
      color: var(--hn-success);
      font-size: 10px;
    }
    .conn.warn {
      color: var(--hn-warning);
    }
    .stack {
      display: inline-flex;
      align-items: center;
      flex: none;
      min-height: var(--hn-tap);
      padding: 0 var(--hn-space-1);
    }
    .stack-dot + .stack-dot {
      margin-left: -8px;
    }
    .count {
      margin-left: var(--hn-space-1);
      font: var(--hn-type-caption);
      color: var(--hn-text-2);
    }
    /* dots + count per width: 2 below 360 (UX-045), 3 on phone, 4 from tablet */
    .stack-dot.d4,
    .count.c4,
    .count.c2 {
      display: none;
    }
    .conn.live {
      display: none;
    }
    @container device (min-width: 600px) {
      .stack-dot.d4,
      .count.c4,
      .conn.live {
        display: inline-flex;
      }
      .count.c3 {
        display: none;
      }
    }
    .me {
      display: none;
      align-items: center;
      gap: var(--hn-space-2);
      min-height: var(--hn-tap);
      padding: 0 var(--hn-space-2);
      font: var(--hn-type-label);
    }
    .badge {
      padding: 0 var(--hn-space-2);
      border-radius: var(--hn-radius-pill);
      border: 1px solid var(--hn-line-strong);
      color: var(--hn-text-2);
      font: var(--hn-type-caption);
    }
    @container device (max-width: 359px) {
      .share {
        display: none;
      }
      .stack-dot.d3,
      .count.c3 {
        display: none;
      }
      .count.c2 {
        display: inline;
      }
      .conn-word {
        display: none;
      }
    }
    @container device (min-width: 1024px) {
      .row {
        padding: 0 var(--hn-space-6);
        gap: var(--hn-space-2);
      }
      .invite-word {
        display: inline;
      }
      .stack {
        display: none;
      }
      .me {
        display: inline-flex;
      }
    }
  `,
})
export class ProtoRoomHeaderComponent {
  protected readonly store = inject(ProtoStore);

  constructor() {
    registerChromeIcons();
  }

  private readonly people = computed(() => orderedPeople(this.store.m()));
  protected readonly stack = computed(() => this.people().slice(0, 4));
  protected more(shown: number): number {
    return Math.max(0, this.people().length - shown);
  }
  protected readonly collide = computed(() => colourCollisions(this.store.m().present));
  protected readonly summary = computed(() => peopleSummary(this.store.m()));
  protected readonly connTitle = computed(() => {
    const c = this.store.m().state.connection;
    return c === 'live'
      ? 'Connected'
      : c === 'reconnecting'
        ? 'Reconnecting… your vote is kept'
        : 'Offline · your vote will sync';
  });

  protected onBack() {
    back(this.store);
  }
}
