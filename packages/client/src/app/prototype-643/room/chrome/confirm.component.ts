/**
 * PROTOTYPE (#643). Confirms, only for actions that affect others (principle 6,
 * UX-005): End for everyone, Remove person, host Leave with others online
 * (UX-032), and "Leave Sprint 42 first?" from Home while stepped out.
 * Everything else uses Undo. A red fill appears only on these confirm buttons
 * (UX-056).
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProtoStore } from '../../proto-store';
import { sessionSummary } from '../../room-model';
import { endNow, leaveNow } from './actions';
import { nextHost } from './people';

interface ConfirmCopy {
  title: string;
  body: string;
  ok: string;
  ux: string;
  run: () => void;
}

@Component({
  selector: 'proto-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (copy(); as c) {
      <div class="cf" [attr.data-ux]="c.ux">
        <h2 id="ov-title" class="title">{{ c.title }}</h2>
        <p id="ov-desc" class="body">{{ c.body }}</p>
        <div class="btns">
          <button type="button" class="hn-btn secondary" data-autofocus (click)="store.close()">
            Cancel
          </button>
          <button type="button" class="hn-btn danger" (click)="c.run()">{{ c.ok }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    .cf {
      display: grid;
      gap: var(--hn-space-3);
      padding: var(--hn-space-5) var(--hn-space-4);
    }
    .title {
      margin: 0;
      font: var(--hn-type-title);
    }
    .body {
      margin: 0;
      font: var(--hn-type-body);
      color: var(--hn-text-2);
    }
    .btns {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--hn-space-2);
      margin-top: var(--hn-space-2);
    }
    @container device (max-width: 599px) {
      .btns {
        flex-direction: column-reverse;
      }
      .btns .hn-btn {
        width: 100%;
      }
    }
  `,
})
export class ProtoConfirmComponent {
  protected readonly store = inject(ProtoStore);

  protected readonly copy = computed<ConfirmCopy | null>(() => {
    const m = this.store.m();
    const name = m.state.name;
    const arg = this.store.overlayArg();
    switch (this.store.overlay()) {
      case 'confirm-end': {
        const sum = sessionSummary(m);
        const left = sum.leftovers;
        return {
          title: `End ${name} for everyone?`,
          body: `Everyone goes Home and sees the summary: ${sum.rows.length} ${sum.rows.length === 1 ? 'story' : 'stories'} estimated${left ? `, ${left} not done` : ''}.`,
          ok: 'End for everyone',
          ux: 'UX-005 UX-032',
          run: () => endNow(this.store),
        };
      }
      case 'confirm-remove': {
        const p = arg ? m.person(arg) : undefined;
        if (!p) return null;
        return {
          title: `Remove ${p.name} from ${name}?`,
          body: `${p.name} sees "${m.self?.name ?? 'The host'} removed you". They can join again with the code; change the password to keep them out.`,
          ok: `Remove ${p.name}`,
          ux: 'UX-005',
          run: () => {
            this.store.close();
            m.removePerson(p.id);
          },
        };
      }
      case 'confirm-leave-host': {
        const to = nextHost(m);
        if (!to) return null;
        return {
          title: `Make ${to.name} host and leave?`,
          body: `${to.name} keeps ${name} running for everyone. It stays in your Recent list.`,
          ok: `Make ${to.name} host and leave`,
          ux: 'UX-032',
          run: () => leaveNow(this.store, to.id),
        };
      }
      case 'confirm-leave-first': {
        const to = m.isHost ? nextHost(m) : undefined;
        return {
          title: `Leave ${name} first?`,
          body: to
            ? `You're still in ${name} as host. ${to.name} becomes host when you leave.`
            : `You're still in ${name}. Leaving lets the others carry on without you.`,
          ok: to ? `Make ${to.name} host and leave` : `Leave ${name}`,
          ux: 'UX-002 UX-032',
          run: () => {
            m.leave(to?.id);
            this.store.close();
            this.store.setEntry({ afterLeave: arg ?? 'continue' });
          },
        };
      }
      default:
        return null;
    }
  });
}
