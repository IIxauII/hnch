/** PROTOTYPE (#643). Design system sheet (owner: entry agent). Stub, to be replaced. */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../proto-store';

@Component({
  selector: 'proto-system',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 16px">proto-system: not built yet</p>`,
})
export class ProtoSystemComponent {
  protected readonly store = inject(ProtoStore);
}
