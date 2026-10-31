/**
 * PROTOTYPE (#643). Keys dialog (`?`): generated from the one interaction
 * registry (interaction.ts → commandsFor), never hand-written, so it matches
 * the CLI `?` overlay and footer (R-51). Fine pointers only.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { commandsFor } from '../../interaction';
import { ProtoStore } from '../../proto-store';
import { ProtoSheetComponent } from './sheet.component';

@Component({
  selector: 'proto-keys-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProtoSheetComponent],
  template: `
    @let m = store.m();
    <proto-sheet heading="Keys" titleId="ov-title" [handle]="false">
      <p class="lead">
        Right now ({{ m.phase }}, {{ m.isHost ? 'host' : m.self?.role === 'viewer' ? 'watching' : 'voter' }}).
        The terminal uses the same keys.
      </p>
      <table class="keys">
        <caption class="visually-hidden">Keyboard shortcuts available now</caption>
        <tbody>
          @for (c of cmds(); track c.id) {
            <tr>
              <th scope="row">
                {{ c.label }}
                @if (c.destructive === 'undo') {
                  <span class="note">· with Undo</span>
                }
                @if (c.destructive === 'confirm') {
                  <span class="note">· asks first</span>
                }
              </th>
              <td>
                @for (k of c.keys; track k) {
                  <kbd class="hn-kbd">{{ k }}</kbd>
                } @empty {
                  <span class="note">⋯ menu</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!singleKeys()) {
        <p class="lead">Single-key shortcuts are off (Profile): letter and digit keys do nothing; use the buttons.</p>
      }
    </proto-sheet>
  `,
  styles: `
    .lead {
      margin: 0 0 var(--hn-space-3);
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .keys {
      width: 100%;
      border-collapse: collapse;
    }
    tr + tr {
      border-top: 1px solid var(--hn-line);
    }
    th {
      text-align: left;
      font: var(--hn-type-small);
      padding: var(--hn-space-2) 0;
    }
    td {
      text-align: right;
      white-space: nowrap;
    }
    td .hn-kbd + .hn-kbd {
      margin-left: var(--hn-space-1);
    }
    .note {
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
  `,
})
export class ProtoKeysSheetComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly cmds = computed(() => {
    const m = this.store.m();
    return commandsFor(m.phase, m.isHost, m.self?.role === 'voter', 'web');
  });
  protected readonly singleKeys = computed(
    () => this.store.entry()['singleKeyShortcuts'] !== false,
  );
}
