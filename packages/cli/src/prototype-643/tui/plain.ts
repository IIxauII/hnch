/**
 * PROTOTYPE (#643). `--plain` / screen-reader mode (UX-104): no boxes, no
 * alternate screen, one plain line per change ("Sam voted. 3 of 5.",
 * "Revealed: Close, suggested 8."). Keys work exactly as in the full Room.
 */
import { PASS, type RoomModel } from '../room-model.js';
import { overlayContent, type Ctx } from './frame.js';
import { term, type TextMode } from './text.js';
import { top, type Ui } from './ui-state.js';

export interface PlainSnap {
  phase: string;
  roundId: string | undefined;
  votes: Set<string>;
  hostId: string;
  connection: string;
  noticeId: number | undefined;
  labAt: number | undefined;
  pick: string | undefined;
  stack: string;
  flash: string | undefined;
  people: string;
  queue: number;
}

export function snap(m: RoomModel, ui: Ui): PlainSnap {
  const r = m.activeRound;
  const t = top(ui);
  return {
    phase: m.phase,
    roundId: r?.id,
    votes: new Set(Object.keys(r?.votes ?? {})),
    hostId: m.state.hostId,
    connection: ui.connecting ? 'connecting' : m.state.connection,
    noticeId: m.state.notices[0]?.id,
    labAt: m.state.lab[0]?.at,
    pick: r?.hostPick,
    stack: t ? `${ui.stack.length}:${JSON.stringify(t)}` : '',
    flash: ui.flash?.text,
    people: m.present.map((p) => `${p.id}${p.online ? 1 : 0}${p.role}`).join(','),
    queue: m.queue.length,
  };
}

function storyText(m: RoomModel): string {
  const r = m.activeRound;
  const st = m.currentStory;
  const pos = m.storyPosition(r?.storyId);
  return `Story ${pos.n} of ${pos.of}${st?.key ? `, ${st.key}` : ''}: ${r?.title ?? ''}`;
}

/** Lines to print for the change from `a` to the current state. */
export function announce(
  a: PlainSnap | undefined,
  m: RoomModel,
  ui: Ui,
  T: TextMode,
  webUrl = '',
): string[] {
  const b = snap(m, ui);
  const out: string[] = [];
  const host = m.host?.name ?? 'the host';
  const say = (s: string) => out.push(term(s, T));
  if (!a || a.connection !== b.connection) {
    if (b.connection === 'connecting')
      say(`hnch · ${m.state.name} · ${m.state.code} · connecting…`);
    else if (b.connection === 'live')
      say(`Live. ${m.self?.name ?? 'You'}${m.isHost ? ', host' : `, host is ${host}`}.`);
    else say(m.statusLine);
  }
  if (a && a.hostId !== b.hostId) say(`${host} is host now.`);
  if (!a || a.phase !== b.phase || a.roundId !== b.roundId) {
    if (b.phase === 'waiting') {
      const next = m.nextStory;
      say(next ? `Waiting. Up next: ${next.key} ${next.title}.` : 'Waiting. No stories queued.');
      say(
        m.isHost
          ? `Press enter to ${m.primary.label}. ? lists keys.`
          : `${m.statusLine} ? lists keys.`,
      );
    } else if (b.phase === 'voting') {
      const prev = m.previousOfRevote;
      say(`Voting on ${storyText(m)}${prev ? ' (re-vote)' : ''}.`);
      say(`Type a card face to vote: ${m.scale.cards.join(' ')}, or - to pass.`);
    } else {
      const o = m.outcome!;
      const word = o.word || (o.kind === 'one' ? '1 vote' : 'No votes');
      say(`Revealed: ${word}${o.suggestion ? `, suggested ${o.suggestion}` : ''}.`);
      const parts = o.columns
        .filter((c) => c.ids.length)
        .map(
          (c) =>
            `${c.face}: ${c.ids.map((id) => (id === m.state.selfId ? 'you' : m.nameOf(id))).join(', ')}`,
        );
      if (o.passes.length) parts.push(`Pass: ${o.passes.map((id) => m.nameOf(id)).join(', ')}`);
      if (parts.length) say(`Votes. ${parts.join('. ')}.`);
      say(
        m.isHost
          ? `Enter: ${m.primary.label}. Left and right pick another value. r re-vote.`
          : m.statusLine,
      );
    }
  } else if (b.phase === 'voting') {
    const r = m.activeRound!;
    const { voted, of } = m.votedCount;
    for (const id of b.votes) {
      if (a.votes.has(id)) continue;
      const v = r.votes[id];
      if (id === m.state.selfId)
        say(`${v === PASS ? 'You passed' : `You voted ${v}`}. ${voted} of ${of}.`);
      else say(`${m.nameOf(id)} voted. ${voted} of ${of}.`);
    }
    for (const id of a.votes)
      if (!b.votes.has(id))
        say(
          `${id === m.state.selfId ? 'Your' : `${m.nameOf(id)}'s`} vote cleared. ${voted} of ${of}.`,
        );
  } else if (b.phase === 'revealed' && a.pick !== b.pick) {
    say(`${m.isHost ? 'Picked' : `${host} picked`} ${m.acceptValue ?? ''}.`);
  }
  if (a && a.people !== b.people) {
    const before = new Set(a.people.split(','));
    for (const p of m.present) {
      const k = `${p.id}${p.online ? 1 : 0}${p.role}`;
      if (!before.has(k) && p.id !== m.state.selfId)
        say(`${p.name} is ${p.online ? (p.role === 'viewer' ? 'watching' : 'here') : 'offline'}.`);
    }
  }
  if (a && b.queue > a.queue && b.phase === 'waiting') say(`Up next is now ${b.queue} stories.`);
  if (b.noticeId !== undefined && a?.noticeId !== b.noticeId) {
    const n = m.state.notices[0]!;
    say(`${n.text}.${n.undoLabel ? ` u to ${n.undoLabel.toLowerCase()}.` : ''}`);
  }
  if (a && b.labAt !== undefined && a.labAt !== b.labAt) {
    const ev = m.state.lab[0]!;
    say(`Lab${ev.ux ? ` ${ev.ux}` : ''}: ${ev.text}.`);
  }
  if (b.flash && a?.flash !== b.flash) say(b.flash);
  if (a && a.stack !== b.stack) {
    const t = top(ui);
    if (!t) say('Closed.');
    else if (t.kind === 'invite') {
      say(`Invite. Code ${m.state.code}. Link ${webUrl}.`);
      say(
        `Terminal: npx -y @xauyxau/hnch join ${m.state.code.replace('-', '')}. c copies the link, esc closes.`,
      );
    } else {
      const ctx: Ctx = {
        m,
        ui,
        o: { W: 200, H: 40, ascii: T.ascii, webUrl: '', now: Date.now() },
        T,
      };
      const { title, lines } = overlayContent(ctx, t, 196, 30);
      say(`${title}:`);
      for (const l of lines) {
        const text = l
          .map((x) => x.t)
          .join('')
          .trimEnd();
        if (text.trim()) say(`  ${text.trim()}`);
      }
    }
  }
  return out;
}
