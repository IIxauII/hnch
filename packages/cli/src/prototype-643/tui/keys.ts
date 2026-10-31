/**
 * PROTOTYPE (#643). One input router with a mode stack (R-48, UX-098):
 *   - Esc closes the top layer only and never quits; a base Esc within 400 ms of
 *     a layer closing is ignored; at base while voting Esc opens the menu.
 *   - `q` acts only at the base layer outside voting.
 *   - While voting, a key that starts a card face is a vote (UX-015: type the
 *     face, unique prefix commits at once, `2` waits 450 ms for `21`); other
 *     registered keys still work; anything else flashes a hint.
 *   - Destructive actions need Undo (skip) or a two-option confirm (end, remove).
 */
import type { Key } from 'ink';

import { flushKey, resolveKey } from '../interaction.js';
import { PASS, SCALES, sessionSummary, type RoomModel } from '../room-model.js';
import type { TuiExit } from '../types.js';
import {
  LAB_ITEMS,
  SCALE_IDS,
  menuItems,
  peopleRows,
  settingItems,
  storyRows,
  top,
  type Flash,
  type MenuId,
  type Mode,
  type Ui,
} from './ui-state.js';

export interface KeyEnv {
  model: RoomModel;
  now: number;
  webUrl: string;
  exit: (reason: TuiExit['reason']) => void;
  /** Copy to the clipboard; the component reports success or the printed fallback. */
  copy: (text: string, what: string) => void;
  /** (Re)arm the 450 ms prefix-settle timer. */
  armSettle: () => void;
}

const ESC_GUARD_MS = 400;

function flash(u: Ui, now: number, text: string, tone: Flash['tone'] = 'info', ms = 2500) {
  u.flash = { text, tone, until: now + ms };
}

function push(u: Ui, mode: Mode) {
  u.stack.push(mode);
}
function pop(u: Ui, now: number) {
  u.stack.pop();
  u.lastPopAt = now;
}
function replaceTop(u: Ui, mode: Mode) {
  u.stack[u.stack.length - 1] = mode;
}

function openMode(env: KeyEnv, id: MenuId | 'lab'): Mode | undefined {
  const m = env.model;
  switch (id) {
    case 'invite':
      return { kind: 'invite' };
    case 'people':
      return { kind: 'people', cursor: 0 };
    case 'stories':
      return { kind: 'stories', cursor: 0 };
    case 'add':
      return { kind: 'add', text: '' };
    case 'help':
      return { kind: 'help', scroll: 0 };
    case 'settings':
      return {
        kind: 'settings',
        cursor: 0,
        scaleIdx: Math.max(0, SCALE_IDS.indexOf(m.state.scaleId)),
      };
    case 'export':
      return m.history.length ? { kind: 'export' } : undefined;
    case 'lab':
      return { kind: 'lab', cursor: 0 };
    default:
      return undefined;
  }
}

/** Run a menu item. Returns true if it opened (replaced) a layer. */
function runMenu(env: KeyEnv, u: Ui, id: MenuId) {
  const m = env.model;
  const mode = openMode(env, id);
  if (mode) return replaceTop(u, mode);
  pop(u, env.now);
  switch (id) {
    case 'skip':
      return m.skip();
    case 'revote':
      return m.revote();
    case 'watch':
      return toggleWatch(env, u);
    case 'leave': {
      const others = m.present.some((p) => p.id !== m.state.selfId && p.online);
      if (m.isHost && others) return push(u, { kind: 'confirm', action: 'leave-host', cursor: 0 });
      m.leave();
      return env.exit('leave');
    }
    case 'end':
      return push(u, { kind: 'confirm', action: 'end', cursor: 0 });
    default:
      return;
  }
}

function toggleWatch(env: KeyEnv, u: Ui) {
  const m = env.model;
  const me = m.self;
  if (!me) return;
  const toViewer = me.role === 'voter';
  m.setRole(toViewer ? 'viewer' : 'voter');
  u.pending = '';
  flash(
    u,
    env.now,
    toViewer ? "You're watching · w to vote instead" : 'You vote again from now on',
    'info',
  );
}

/** Registered commands that work outside a layer (any phase they are listed for). */
function baseCommand(env: KeyEnv, u: Ui, ch: string): boolean {
  const m = env.model;
  const ph = m.phase;
  switch (ch) {
    case '?':
      push(u, { kind: 'help', scroll: 0 });
      return true;
    case 'i':
      push(u, { kind: 'invite' });
      return true;
    case 'p':
      push(u, { kind: 'people', cursor: 0 });
      return true;
    case 't':
      push(u, { kind: 'stories', cursor: 0 });
      return true;
    case 'w':
      toggleWatch(env, u);
      return true;
    case 'u':
      if (m.state.pending.length) m.undo();
      else flash(u, env.now, 'Nothing to undo');
      return true;
    case '+':
      if (ph === 'voting') {
        flash(u, env.now, 'Add stories between stories · esc opens the menu');
        return true;
      }
      push(u, { kind: 'add', text: '' });
      return true;
    case 'm':
      if (ph === 'voting') return false;
      push(u, { kind: 'menu', cursor: 0 });
      return true;
    case 's':
      if (!m.isHost || ph === 'waiting') return false;
      m.skip();
      return true;
    case 'r':
      if (!m.isHost || ph !== 'revealed') return false;
      m.revote();
      return true;
    case 'c':
      if (ph === 'voting') return false;
      env.copy(env.webUrl, 'Invite link');
      return true;
    case 'q':
      if (ph === 'voting') {
        flash(u, env.now, 'q works outside voting · esc opens the menu (leave is in there)');
        return true;
      }
      env.exit('quit');
      return true;
    default:
      return false;
  }
}

function castVote(env: KeyEnv, u: Ui, face: string) {
  const m = env.model;
  const r = m.activeRound;
  const before = r?.votes[m.state.selfId];
  m.vote(face);
  u.cursor = null;
  // UX-023: the same face again keeps the vote (no silent clear)
  if (before === face)
    flash(u, env.now, `Still ${face === PASS ? 'passing' : face} · ⌫ clears your vote`);
}

/** Feed card-face characters through the resolver (voting: vote; revealed host: pick). */
function feedFaces(env: KeyEnv, u: Ui, ch: string, commit: (face: string) => void): boolean {
  const cards = env.model.scale.cards;
  const k = ch.toLowerCase();
  const startsFace = cards.some((c) => c.toLowerCase().startsWith(k));
  const extends_ =
    u.pending && cards.some((c) => c.toLowerCase().startsWith((u.pending + k).toLowerCase()));
  const absorbs = u.absorb && u.absorb[0]?.toLowerCase() === k;
  if (!startsFace && !extends_ && !absorbs) {
    // not a face: commit a waiting exact face first, then let the caller treat it as a command
    if (u.pending) {
      const exact = flushKey(cards, u.pending);
      u.pending = '';
      if (exact) commit(exact);
    }
    u.absorb = '';
    return false;
  }
  const res = resolveKey(cards, u.pending, u.absorb, ch);
  u.pending = res.pending;
  u.absorb = res.absorb;
  if (res.commit) commit(res.commit);
  if (res.pending || res.absorb) env.armSettle();
  return true;
}

/** The 450 ms settle timer fired. */
export function settle(env: KeyEnv, ui: Ui): Ui {
  const u: Ui = { ...ui, stack: [...ui.stack] };
  const m = env.model;
  if (u.pending) {
    const exact = flushKey(m.scale.cards, u.pending);
    if (exact) {
      if (m.phase === 'voting') castVote(env, u, exact);
      else if (m.phase === 'revealed' && m.isHost) m.pick(exact);
    }
  }
  u.pending = '';
  u.absorb = '';
  return u;
}

function moveCursor(env: KeyEnv, u: Ui, d: number) {
  const m = env.model;
  const cards = m.scale.cards;
  const n = cards.length + 1; // + Pass
  if (u.cursor === null) {
    // the cursor starts on your current vote, not on card 0 (UX-015)
    const mine = m.activeRound?.votes[m.state.selfId];
    const i = mine === PASS ? cards.length : mine ? cards.indexOf(mine) : -1;
    u.cursor = i >= 0 ? (i + d + n) % n : d > 0 ? 0 : n - 1;
  } else u.cursor = (u.cursor + d + n) % n; // arrows wrap
}

function movePick(env: KeyEnv, d: number) {
  const m = env.model;
  const cards = m.scale.cards;
  const cur = m.acceptValue;
  const i = cur ? cards.indexOf(cur) : Math.floor(cards.length / 2);
  const next = cards[Math.max(0, Math.min(cards.length - 1, i + d))];
  if (next) m.pick(next);
}

function primary(env: KeyEnv, u: Ui) {
  const m = env.model;
  if (!m.isHost) {
    if (m.phase === 'waiting')
      flash(u, env.now, `Waiting for ${m.host?.name ?? 'the host'} to start`);
    return;
  }
  const p = m.primary;
  if (!p.enabled) return flash(u, env.now, p.label, 'warning');
  if (p.action === 'start') m.start();
  else if (p.action === 'reveal') m.reveal();
  else if (p.action === 'accept') m.accept();
  else if (p.action === 'revote') m.revote();
}

export function handleKey(env: KeyEnv, ui: Ui, input: string, key: Key): Ui {
  const u: Ui = { ...ui, stack: [...ui.stack] };
  const m = env.model;
  const now = env.now;

  if (key.ctrl && input === 'c') {
    env.exit('interrupted'); // main.ts prints the summary and exits 130 (R-50)
    return u;
  }
  const me = m.self;
  if ((me?.removedBy && me.leftAt) || m.state.ended) {
    env.exit(m.state.ended ? 'ended' : 'removed');
    return u;
  }
  if (key.ctrl && input === 'l') {
    if (top(u)?.kind !== 'lab') push(u, { kind: 'lab', cursor: 0 });
    return u;
  }

  const t = top(u);
  if (t) {
    layerKey(env, u, t, input, key);
    return u;
  }

  // ── base layer ──
  const ph = m.phase;
  if (key.escape) {
    if (now - u.lastPopAt < ESC_GUARD_MS) return u;
    if (u.pending) {
      u.pending = '';
      u.absorb = '';
      return u;
    }
    if (ph === 'voting') push(u, { kind: 'menu', cursor: 0 });
    return u; // never quits
  }

  if (ph === 'voting') {
    const voter = me?.role === 'voter';
    if (key.return) {
      if (u.pending) {
        const exact = flushKey(m.scale.cards, u.pending);
        u.pending = '';
        u.absorb = '';
        if (exact && voter) castVote(env, u, exact);
        return u;
      }
      primary(env, u);
      return u;
    }
    if (key.backspace || key.delete) {
      if (u.pending) u.pending = '';
      else if (voter) m.clearVote();
      return u;
    }
    if (key.leftArrow || key.rightArrow) {
      if (voter) moveCursor(env, u, key.leftArrow ? -1 : 1);
      return u;
    }
    if (input === ' ') {
      if (voter && u.cursor !== null) {
        const cards = m.scale.cards;
        castVote(env, u, u.cursor === cards.length ? PASS : cards[u.cursor]!);
      }
      return u;
    }
    for (const ch of Array.from(input)) {
      if (ch === '-') {
        if (voter) castVote(env, u, PASS);
        continue;
      }
      if (voter && feedFaces(env, u, ch, (f) => castVote(env, u, f))) continue;
      if (!voter && /[0-9]/u.test(ch)) {
        flash(u, now, "You're watching · w to vote instead");
        continue;
      }
      if (baseCommand(env, u, ch)) continue;
      if (/\S/u.test(ch)) flash(u, now, 'Letters are cards while voting · esc opens the menu');
    }
    return u;
  }

  if (ph === 'revealed') {
    if (key.return) {
      if (u.pending) Object.assign(u, settle(env, u));
      primary(env, u);
      return u;
    }
    if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
      if (m.isHost) movePick(env, key.leftArrow || key.upArrow ? -1 : 1);
      return u;
    }
    for (const ch of Array.from(input)) {
      if (m.isHost && feedFaces(env, u, ch, (f) => m.pick(f))) continue;
      if (baseCommand(env, u, ch)) continue;
      if (!m.isHost && /[0-9]/u.test(ch))
        flash(u, now, `${m.host?.name ?? 'The host'} accepts the value`);
    }
    return u;
  }

  // waiting
  if (key.return) {
    primary(env, u);
    return u;
  }
  for (const ch of Array.from(input)) baseCommand(env, u, ch);
  return u;
}

function layerKey(env: KeyEnv, u: Ui, t: Mode, input: string, key: Key) {
  const m = env.model;
  const now = env.now;
  const up = key.upArrow ? -1 : key.downArrow ? 1 : 0;
  const clamp = (i: number, n: number) => Math.max(0, Math.min(Math.max(0, n - 1), i));

  switch (t.kind) {
    case 'help': {
      if (key.escape || input === '?' || input === 'q') return pop(u, now);
      if (up) replaceTop(u, { ...t, scroll: Math.max(0, t.scroll + up) });
      return;
    }
    case 'invite': {
      if (key.escape || input === 'i' || input === 'q') return pop(u, now);
      if (input === 'c') env.copy(env.webUrl, 'Invite link');
      return;
    }
    case 'export': {
      if (key.escape || input === 'q') return pop(u, now);
      if (input === 'c') {
        env.copy(sessionSummary(m).text, 'Summary');
      }
      return;
    }
    case 'add': {
      if (key.escape) return pop(u, now);
      const submit = () => {
        if (t.text.trim()) m.addStories(t.text);
        pop(u, now);
      };
      if (key.ctrl && input === 'd') return submit();
      if (key.return) {
        const last = t.text.split('\n').pop() ?? '';
        if (!last.trim()) return submit();
        return replaceTop(u, { ...t, text: `${t.text}\n` });
      }
      if (key.backspace || key.delete) return replaceTop(u, { ...t, text: t.text.slice(0, -1) });
      if (input && !key.ctrl && !key.meta) {
        const text = t.text + input.replace(/\r\n?/gu, '\n');
        replaceTop(u, { ...t, text });
      }
      return;
    }
    case 'people': {
      if (key.escape || input === 'p') return pop(u, now);
      const ppl = peopleRows(m);
      if (up) return replaceTop(u, { ...t, cursor: clamp(t.cursor + up, ppl.length) });
      const p = ppl[t.cursor];
      if (!p || !m.isHost) return;
      if (input === 'h') {
        if (p.id === m.state.selfId) return flash(u, now, "You're already the host");
        if (!p.online || p.role === 'viewer')
          return flash(u, now, `${p.name} can't host right now`, 'warning');
        m.makeHost(p.id);
        return pop(u, now);
      }
      if (input === 'x') {
        if (p.id === m.state.selfId) return flash(u, now, 'Use Leave in the menu to leave');
        return push(u, { kind: 'confirm', action: 'remove', arg: p.id, cursor: 0 });
      }
      return;
    }
    case 'stories': {
      if (key.escape || input === 't') return pop(u, now);
      const all = storyRows(m);
      if (up) return replaceTop(u, { ...t, cursor: clamp(t.cursor + up, all.length) });
      if (input === '+') return push(u, { kind: 'add', text: '' });
      const r = all[t.cursor];
      if (!r || !m.isHost) return;
      if (input === 'n' && r.section === 'Up next') {
        m.doNext(r.story.id);
        return flash(u, now, `${r.story.key || r.story.title} is next`, 'success');
      }
      if (input === 'x' && r.section === 'Up next') {
        m.removeStory(r.story.id);
        return replaceTop(u, { ...t, cursor: clamp(t.cursor, all.length - 1) });
      }
      if (input === 'b' && r.section === 'Skipped') return m.bringBack(r.story.id);
      return;
    }
    case 'menu': {
      if (key.escape || input === 'm') return pop(u, now);
      const items = menuItems(m);
      if (up) return replaceTop(u, { ...t, cursor: clamp(t.cursor + up, items.length) });
      if (key.return) {
        const it = items[t.cursor];
        if (it) runMenu(env, u, it.id);
        return;
      }
      const it = items.find((x) => x.key && x.key === input);
      if (it) runMenu(env, u, it.id);
      return;
    }
    case 'confirm': {
      if (key.escape) return pop(u, now);
      if (key.leftArrow || key.rightArrow || key.tab || up)
        return replaceTop(u, { ...t, cursor: t.cursor === 0 ? 1 : 0 });
      if (!key.return) return;
      pop(u, now);
      if (t.cursor === 0) return;
      if (t.action === 'end') m.endForEveryone();
      else if (t.action === 'remove' && t.arg) {
        m.removePerson(t.arg);
        // the people list under this confirm keeps a valid cursor
        const below = top(u);
        if (below?.kind === 'people') replaceTop(u, { ...below, cursor: 0 });
      } else if (t.action === 'leave-host') {
        m.leave();
        env.exit('leave');
      }
      return;
    }
    case 'settings': {
      if (key.escape) return pop(u, now);
      const items = settingItems(m);
      if (up) return replaceTop(u, { ...t, cursor: clamp(t.cursor + up, items.length) });
      const id = items[t.cursor];
      if (id === 'scale' && (key.leftArrow || key.rightArrow)) {
        const n = SCALE_IDS.length;
        return replaceTop(u, { ...t, scaleIdx: (t.scaleIdx + (key.leftArrow ? -1 : 1) + n) % n });
      }
      if (!key.return) return;
      if (id === 'scale') {
        const sid = SCALE_IDS[t.scaleIdx]!;
        if (sid === m.state.scaleId) return;
        if (m.phase === 'voting') {
          // applies between stories: the model refuses mid-vote; say when it will apply
          return flash(
            u,
            now,
            `Change the scale between stories (${SCALES[sid]?.label ?? sid} not applied)`,
            'warning',
          );
        }
        m.setScale(sid);
        return flash(
          u,
          now,
          `Scale is ${SCALES[sid]?.label ?? sid} from the next story`,
          'success',
        );
      }
      if (id === 'password') {
        if (m.state.password) {
          m.setPassword(false);
          return flash(u, now, 'Password off · anyone with the link can join', 'warning');
        }
        return push(u, { kind: 'password', value: '' });
      }
      if (id === 'name') return push(u, { kind: 'name', value: m.self?.name ?? '' });
      return;
    }
    case 'password':
    case 'name': {
      // a plain input that Esc always cancels (UX-094: never a freeze)
      if (key.escape) return pop(u, now);
      if (key.return) {
        const v = t.value.trim();
        pop(u, now);
        if (!v) return;
        if (t.kind === 'password') {
          m.setPassword(true);
          return flash(u, now, 'Password set · people need it to join', 'success');
        }
        m.renameSelf(v);
        return flash(u, now, `You're ${v} now`, 'success');
      }
      if (key.backspace || key.delete) return replaceTop(u, { ...t, value: t.value.slice(0, -1) });
      if (input && !key.ctrl && !key.meta && !input.includes('\r'))
        replaceTop(u, { ...t, value: t.value + input });
      return;
    }
    case 'lab': {
      if (key.escape) return pop(u, now);
      if (up) return replaceTop(u, { ...t, cursor: clamp(t.cursor + up, LAB_ITEMS.length) });
      let idx = -1;
      if (key.return) idx = t.cursor;
      else if (/^[1-9]$/u.test(input)) idx = Number(input) - 1;
      const it = LAB_ITEMS[idx];
      if (!it) return;
      pop(u, now);
      runLab(env, u, it.id);
      return;
    }
  }
}

function runLab(env: KeyEnv, u: Ui, id: string) {
  const m = env.model;
  const now = env.now;
  switch (id) {
    case 'everyone':
      if (m.phase !== 'voting') return flash(u, now, 'Start a story first (⏎)', 'warning');
      return m.everyoneVotes();
    case 'reload':
      return m.simulateReload('sam');
    case 'host-drop':
      return m.simulateHostOffline();
    case 'self-offline':
      return m.simulateSelfOffline();
    case 'double-start':
      return m.simulateDoubleStart();
    case 'kick':
      return m.simulateKick();
    case 'peer-back':
      return m.simulatePeerBack('ana');
    case 'peer-stories': {
      m.addStories('PROJ-201 Audit log\nPROJ-202 Invite by email\nPROJ-203 Sticky story bar');
      // a peer's paste: no undo for you, just the notice
      m.state.pending.pop();
      m.notify('Ana added 3 stories · they show up in Up next right away');
      m.state.lab.unshift({
        at: Date.now(),
        text: 'Ana added 3 stories: the Room observes the agenda live and pre-fills the next start',
        ux: 'UX-011',
      });
      return;
    }
    case 'auto':
      m.setPeersAutoVote(!m.state.peersAutoVote);
      return flash(u, now, `Peers vote on their own: ${m.state.peersAutoVote ? 'on' : 'off'}`);
  }
}
