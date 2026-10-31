/** PROTOTYPE (#643). Stage: story bar, status line, table, deck, Strip, hero, action bar (owner: stage agent). Stub, to be replaced. */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../proto-store';

@Component({
  selector: 'proto-room-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 16px">proto-room-stage: not built yet</p>`,
})
export class ProtoRoomStageComponent {
  protected readonly store = inject(ProtoStore);
}
