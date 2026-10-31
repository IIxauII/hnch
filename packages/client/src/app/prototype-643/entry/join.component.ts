/** PROTOTYPE (#643). Join preview (owner: entry agent). Stub, to be replaced. */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../proto-store';

@Component({
  selector: 'proto-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 16px">proto-join: not built yet</p>`,
})
export class ProtoJoinComponent {
  protected readonly store = inject(ProtoStore);
}
