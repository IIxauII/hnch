/** PROTOTYPE (#643). Home (owner: entry agent). Stub, to be replaced. */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../proto-store';

@Component({
  selector: 'proto-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 16px">proto-home: not built yet</p>`,
})
export class ProtoHomeComponent {
  protected readonly store = inject(ProtoStore);
}
