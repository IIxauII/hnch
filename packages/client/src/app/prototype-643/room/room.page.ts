/**
 * PROTOTYPE (#643). The Room: one route, three phases, every role (§2.1).
 * Composition only. Layout uses container queries on the device frame
 * (`container-name: device`), never media queries, so the lab's frame toggle
 * drives phone / tablet / desktop:
 *   < 600 px   phone: header, stage (table in the middle, hand at the bottom), sticky action bar
 *   600–1023   tablet: single column like the phone; People and Stories open as side sheets
 *   ≥ 1024     desktop: 1136 frame = 720 stage + 32 gap + 320 rail; primary in the stage footer
 * Removed people see a terminal state in place (§2.1 "Not phases").
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../proto-store';
import { ProtoRoomHeaderComponent } from './room-header.component';
import { ProtoRoomOverlaysComponent } from './room-overlays.component';
import { ProtoRoomRailComponent } from './room-rail.component';
import { ProtoRoomStageComponent } from './room-stage.component';

@Component({
  selector: 'proto-room',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ProtoRoomHeaderComponent,
    ProtoRoomStageComponent,
    ProtoRoomRailComponent,
    ProtoRoomOverlaysComponent,
  ],
  template: `
    @let m = store.m();
    @if (m.self?.removedBy) {
      <main class="removed" aria-labelledby="removed-h">
        <h1 id="removed-h">{{ m.nameOf(m.self?.removedBy ?? '') }} removed you from {{ m.state.name }}</h1>
        <p>You can join again with the code if they invite you back.</p>
        <button type="button" class="hn-btn primary" (click)="store.screen.set('home')">Done</button>
      </main>
    } @else {
      <proto-room-header />
      <div class="room-body">
        <proto-room-stage class="room-stage" />
        <proto-room-rail class="room-rail" />
      </div>
      <proto-room-overlays />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      background: var(--hn-bg);
    }
    .room-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      width: 100%;
      margin: 0 auto;
    }
    .room-stage {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .room-rail {
      display: none;
    }
    @container device (min-width: 1024px) {
      .room-body {
        flex-direction: row;
        align-items: flex-start;
        gap: var(--hn-space-6);
        max-width: var(--hn-frame-max);
        padding: var(--hn-space-5) var(--hn-space-6);
      }
      .room-stage {
        flex: 0 1 var(--hn-stage-max);
      }
      .room-rail {
        display: block;
        flex: 0 0 var(--hn-rail-w);
      }
    }
    @container device (min-width: 1600px) {
      .room-body {
        max-width: calc(var(--hn-stage-max) + var(--hn-rail-w) + 3 * var(--hn-space-6));
      }
    }
    .removed {
      margin: auto;
      padding: var(--hn-space-6) var(--hn-space-4);
      max-width: 420px;
      display: grid;
      gap: var(--hn-space-4);
      text-align: center;
    }
    .removed h1 {
      font: var(--hn-type-title);
      margin: 0;
    }
    .removed p {
      font: var(--hn-type-small);
      color: var(--hn-text-2);
      margin: 0;
    }
  `,
})
export class ProtoRoomPage {
  protected readonly store = inject(ProtoStore);
}
