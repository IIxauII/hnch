/** PROTOTYPE (#643). Sheets, confirms, menu, toast (owner: chrome agent). Stub, to be replaced. */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../proto-store';

@Component({
  selector: 'proto-room-overlays',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 16px">proto-room-overlays: not built yet</p>`,
})
export class ProtoRoomOverlaysComponent {
  protected readonly store = inject(ProtoStore);
}
