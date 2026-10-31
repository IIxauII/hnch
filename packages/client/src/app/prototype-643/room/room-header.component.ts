/** PROTOTYPE (#643). Room header (owner: chrome agent). Stub, to be replaced. */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../proto-store';

@Component({
  selector: 'proto-room-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 16px">proto-room-header: not built yet</p>`,
})
export class ProtoRoomHeaderComponent {
  protected readonly store = inject(ProtoStore);
}
