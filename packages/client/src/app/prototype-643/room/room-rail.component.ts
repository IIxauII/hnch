/** PROTOTYPE (#643). Desktop rail: People, Up next, Done (owner: chrome agent). Stub, to be replaced. */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../proto-store';

@Component({
  selector: 'proto-room-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 16px">proto-room-rail: not built yet</p>`,
})
export class ProtoRoomRailComponent {
  protected readonly store = inject(ProtoStore);
}
