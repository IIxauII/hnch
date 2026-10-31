/**
 * PROTOTYPE (#643). Exit semantics in one place (UX-002, UX-032, plan §3.3 #27):
 * - Back (‹) = step out (O3 'step-out'): the session stays alive, nobody else is affected.
 * - Leave (⋯) writes leftAt and keeps Recent. A host with others online confirms the hand-off.
 * - End for everyone is always confirmed (it affects others, principle 6).
 */
import type { ProtoStore } from '../../proto-store';
import { nextHost } from './people';

export function back(store: ProtoStore): void {
  const m = store.model;
  if (m.state.decisions.back === 'step-out') {
    store.close();
    m.stepOut();
    store.screen.set('home');
    return;
  }
  leave(store);
}

export function leave(store: ProtoStore): void {
  const m = store.model;
  if (m.isHost && nextHost(m)) {
    store.open('confirm-leave-host');
    return;
  }
  leaveNow(store);
}

export function leaveNow(store: ProtoStore, handTo?: string): void {
  store.close();
  store.model.leave(handTo);
  store.screen.set('home');
}

export function endNow(store: ProtoStore): void {
  const m = store.model;
  store.close();
  m.endForEveryone();
  if (m.state.decisions.sessionEnd === 'home') store.screen.set('home');
}
