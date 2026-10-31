/**
 * PROTOTYPE (#643). The room ⋯ menu (plan §3.3 #25): one level, one item per
 * line, ≤ 10 rows. Destructive rows are red TEXT on a neutral row after a
 * divider, never a red block (UX-056). Room settings is host-only (UX-006).
 * Skip story carries the one verb used everywhere (UX-005).
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { type Overlay, ProtoStore } from '../../proto-store';
import { sessionSummary } from '../../room-model';
import { leave } from './actions';
import { copyText } from './icons';
import { ProtoSheetComponent } from './sheet.component';

interface Item {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
  divider?: boolean;
  ux?: string;
  run: () => void;
}

@Component({
  selector: 'proto-menu-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ProtoSheetComponent],
  template: `
    @let m = store.m();
    <proto-sheet [heading]="m.state.name" titleId="ov-title" [handle]="false">
      <ul class="menu" role="list" data-ux="UX-056">
        @for (it of items(); track it.id) {
          <li [class.divider]="it.divider">
            <button
              type="button"
              class="item"
              [class.danger]="it.danger"
              [attr.data-ux]="it.ux ?? null"
              (click)="it.run()"
            >
              <ion-icon [name]="it.icon" aria-hidden="true" />
              <span>{{ it.label }}</span>
            </button>
          </li>
        }
      </ul>
    </proto-sheet>
  `,
  styles: `
    .menu {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li.divider {
      border-top: 1px solid var(--hn-line);
      margin-top: var(--hn-space-1);
      padding-top: var(--hn-space-1);
    }
    .item {
      display: flex;
      align-items: center;
      gap: var(--hn-space-3);
      width: 100%;
      min-height: var(--hn-tap);
      padding: 0 var(--hn-space-2);
      border: 0;
      border-radius: var(--hn-radius-sm);
      background: transparent;
      color: var(--hn-text);
      font: var(--hn-type-body);
      text-align: left;
      cursor: pointer;
    }
    .item:hover {
      background: var(--hn-surface-2);
    }
    .item ion-icon {
      font-size: 20px;
      color: var(--hn-text-2);
    }
    .item.danger,
    .item.danger ion-icon {
      color: var(--hn-danger);
    }
  `,
})
export class ProtoMenuSheetComponent {
  protected readonly store = inject(ProtoStore);

  protected readonly items = computed<Item[]>(() => {
    const m = this.store.m();
    const open = (o: Overlay) => () => this.store.open(o);
    const host = m.isHost;
    const active = m.phase !== 'waiting' && !!m.currentStory;
    const watching = m.self?.role === 'viewer';
    const out: Item[] = [
      { id: 'invite', label: 'Invite', icon: 'person-add-outline', run: open('invite') },
      { id: 'people', label: 'People', icon: 'people-outline', run: open('people') },
      { id: 'stories', label: 'Stories', icon: 'list-outline', run: open('stories') },
    ];
    if (host && active)
      out.push({
        id: 'skip',
        label: 'Skip story',
        icon: 'play-skip-forward-outline',
        ux: 'UX-005 UX-054',
        run: () => {
          this.store.close();
          m.skip();
        },
      });
    if (host && m.done.length)
      out.push({
        id: 'summary',
        label: 'Copy summary',
        icon: 'clipboard-outline',
        run: () => {
          copyText(sessionSummary(m).text);
          this.store.close();
          m.notify('Summary copied', 'success');
          this.store.bump();
        },
      });
    out.push(
      {
        id: 'watch',
        label: watching ? 'Vote instead' : 'Just watching',
        icon: 'eye-outline',
        divider: true,
        ux: 'UX-069',
        run: () => {
          this.store.close();
          m.setRole(watching ? 'voter' : 'viewer');
        },
      },
      {
        id: 'profile',
        label: 'Profile',
        icon: 'person-circle-outline',
        ux: 'UX-079',
        run: open('profile'),
      },
    );
    if (host)
      out.push({
        id: 'settings',
        label: 'Room settings',
        icon: 'options-outline',
        ux: 'UX-006',
        run: open('room-settings'),
      });
    if (this.store.pointer() === 'fine')
      out.push({ id: 'keys', label: 'Keys', icon: 'help-circle-outline', run: open('keys') });
    out.push({
      id: 'leave',
      label: 'Leave',
      icon: 'exit-outline',
      danger: true,
      divider: true,
      ux: 'UX-032',
      run: () => leave(this.store),
    });
    if (host)
      out.push({
        id: 'end',
        label: 'End for everyone',
        icon: 'power-outline',
        danger: true,
        run: open('confirm-end'),
      });
    return out;
  });
}
