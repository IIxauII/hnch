/**
 * PROTOTYPE (#643). Primary dispatch and the Room keyboard (UX-018, UX-019).
 * Keys come from the one registry in interaction.ts (COMMANDS / commandsFor);
 * card faces go through resolveKey / flushKey / KEY_SETTLE_MS, so typing votes
 * BY FACE VALUE: `8` votes 8, `1` `3` votes 13, `2` waits 450 ms because 21 exists.
 */
import { commandsFor, flushKey, KEY_SETTLE_MS, resolveKey } from '../../interaction';
import { type Overlay, type ProtoStore } from '../../proto-store';
import { PASS, type RoomModel } from '../../room-model';
import { type StageUi } from './stage-ui';

export function runPrimary(m: RoomModel) {
  const p = m.primary;
  if (!p.enabled) return;
  switch (p.action) {
    case 'start':
      m.start();
      break;
    case 'reveal':
      m.reveal();
      break;
    case 'accept':
      m.accept();
      break;
    case 'revote':
      m.revote();
      break;
    case 'none':
      break;
  }
}

const OPENS: Record<string, Overlay> = {
  help: 'keys',
  invite: 'invite',
  add: 'add-stories',
  people: 'people',
  stories: 'stories',
  menu: 'menu',
};

/** Handled outside the registry lookup below (they are not single command letters). */
const SPECIAL = new Set(['primary', 'vote', 'pass', 'pick', 'close', 'leave', 'end']);

export class StageKeys {
  private pendingTimer: ReturnType<typeof setTimeout> | undefined;
  private absorbTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: ProtoStore,
    private readonly ui: StageUi,
  ) {}

  reset() {
    clearTimeout(this.pendingTimer);
    clearTimeout(this.absorbTimer);
    this.ui.pending.set('');
    this.ui.absorb = '';
  }

  /** Returns true when the event was handled. */
  handle(e: KeyboardEvent): boolean {
    const store = this.store;
    if (store.screen() !== 'room' || store.overlay() !== null) return false;
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
    const t = e.target instanceof HTMLElement ? e.target : null;
    // never while typing in a field, and never for the lab panel (R-37)
    if (t?.closest('input, textarea, select, [contenteditable], .proto-lab')) return false;
    // single-key shortcuts can be turned off (WCAG 2.1.4); Enter on the primary still works
    const keysOff = store.entry()['singleKeyShortcuts'] === false;

    const m = store.model;
    const phase = m.phase;
    const isVoter = m.self?.role === 'voter';
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const onControl = !!t?.closest('button, a, [role="button"]');

    if (key === 'Enter') {
      if (onControl) return false; // native activation of the focused control
      if (this.ui.pending()) {
        this.flush();
        return true;
      }
      if (m.isHost && m.primary.enabled) {
        runPrimary(m);
        return true;
      }
      return false;
    }
    if (keysOff) return false;

    const cardMode = phase === 'voting' && isVoter;
    if (cardMode && key.length === 1 && key !== '-' && key !== '?' && key !== '+') {
      const cards = m.scale.cards;
      const pend = this.ui.pending();
      const absorbing = !!this.ui.absorb && this.ui.absorb[0]?.toLowerCase() === key;
      const extends_ = cards.some((c) => c.toLowerCase().startsWith(pend + key));
      const starts = cards.some((c) => c.toLowerCase().startsWith(key));
      if (absorbing || extends_ || starts) {
        this.feed(key);
        return true;
      }
      if (pend) this.flush(); // a non-face key commits the pending exact face, then acts as a command
    }

    if (cardMode && key === '-') {
      this.reset();
      m.vote(PASS);
      return true;
    }
    if (cardMode && key === 'Backspace') {
      if (this.ui.pending()) this.reset();
      else m.clearVote();
      return true;
    }

    if ((key === 'ArrowLeft' || key === 'ArrowRight') && phase === 'revealed' && m.isHost) {
      // ←/→ outside the device belong to the lab's scene switcher
      if (!t?.closest('.hn-proto')) return false;
      const faces = m.scale.cards;
      const cur = m.acceptValue ? faces.indexOf(m.acceptValue) : -1;
      const next =
        key === 'ArrowRight'
          ? Math.min(faces.length - 1, cur + 1)
          : cur < 0
            ? faces.length - 1
            : Math.max(0, cur - 1);
      const face = faces[next];
      if (face) m.pick(face);
      return true;
    }

    if (key.length !== 1) return false;
    const cmd = commandsFor(phase, m.isHost, isVoter, 'web').find(
      (c) => !SPECIAL.has(c.id) && c.keys.includes(key),
    );
    if (!cmd) return false;
    const overlay = OPENS[cmd.id];
    if (overlay) {
      store.open(overlay);
      return true;
    }
    switch (cmd.id) {
      case 'revote':
        m.revote();
        return true;
      case 'skip':
        if (!m.currentStory) return false; // untitled round: skip() would hit the next queued story
        m.skip();
        return true;
      case 'undo':
        m.undo();
        return true;
      case 'watch':
        m.setRole(m.self?.role === 'viewer' ? 'voter' : 'viewer');
        return true;
    }
    return false;
  }

  private feed(key: string) {
    const m = this.store.model;
    const cards = m.scale.cards;
    const res = resolveKey(cards, this.ui.pending(), this.ui.absorb, key);
    if (res.commit) m.vote(res.commit);
    this.ui.pending.set(res.pending);
    this.ui.absorb = res.absorb;
    clearTimeout(this.pendingTimer);
    if (res.pending) this.pendingTimer = setTimeout(() => this.flush(), KEY_SETTLE_MS);
    clearTimeout(this.absorbTimer);
    if (res.absorb)
      this.absorbTimer = setTimeout(() => {
        this.ui.absorb = '';
      }, KEY_SETTLE_MS);
  }

  private flush() {
    const m = this.store.model;
    const face = flushKey(m.scale.cards, this.ui.pending());
    clearTimeout(this.pendingTimer);
    this.ui.pending.set('');
    if (face) m.vote(face);
  }
}
