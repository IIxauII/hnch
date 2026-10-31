/**
 * PROTOTYPE (#643). The pure TUI frame: `screen(model, ui, opts)` returns exactly
 * `rows − 1` lines, each exactly `columns` cells (R-45: on Ink 5 a frame of
 * `rows` or more clears the terminal on every render; UX-095). Layout per plan
 * §5.9; frames per §6.6. Nothing here touches the terminal.
 */
import { COMMANDS, commandsFor, flushKey, footerHints } from '../interaction.js';
import { PASS, RoomModel, SCALES, sessionSummary, type Person } from '../room-model.js';
import { qrRows } from './qr.js';
import {
  blank,
  box,
  cw,
  fit,
  glyph,
  hcat,
  lineWidth,
  lr,
  minutes,
  padEnd,
  padStart,
  rows,
  rule,
  term,
  trunc,
  type Line,
  type Seg,
  type TextMode,
  type Tone,
} from './text.js';
import {
  LAB_ITEMS,
  SCALE_IDS,
  menuItems,
  peopleRows,
  settingItems,
  storyRows,
  top,
  type Mode,
  type Ui,
} from './ui-state.js';

export interface FrameOpts {
  W: number;
  H: number;
  ascii: boolean;
  webUrl: string;
  now: number;
}

export const STAGE_ROWS = 11;
export const PANEL_W = 30;

export interface Ctx {
  m: RoomModel;
  ui: Ui;
  o: FrameOpts;
  T: TextMode;
}

const s = (t: string, tone?: Tone, extra: Partial<Seg> = {}): Seg => ({ t, tone, ...extra });

// ── top level ───────────────────────────────────────────────────────────────

export function screen(m: RoomModel, ui: Ui, o: FrameOpts): Line[] {
  const { W, H } = o;
  const T: TextMode = { ascii: o.ascii };
  const c: Ctx = { m, ui, o, T };
  const FH = H - 1;
  if (W < 60 || H < 20) {
    return rows([fit([s(` hnch needs at least 60×20 (this terminal is ${W}×${H})`)], W, T)], FH, W);
  }
  const end = terminalMessage(c);
  if (end) return terminalFrame(c, end);

  const t = top(ui);
  const B = FH - 5; // body band between the rule under the header and the toast row
  const alone = isAlone(m);

  // invite overlay: a bordered box over the body; on short terminals it takes
  // over the header-through-toast rows so the QR fits (§5.9 60×20)
  if (t?.kind === 'invite' && B < 18) {
    const band = inviteBody(c, W, B + 2, false);
    return [...band, toastRow(c), rule(W, T), footer(c)];
  }

  const wide = W >= 100 && !alone && t?.kind !== 'invite';
  const mainW = wide ? W - PANEL_W - 1 : W;
  let body: Line[];
  if (t?.kind === 'invite') body = inviteBody(c, mainW, B, true);
  else if (t) body = overlayBody(c, t, mainW, B);
  else body = baseBody(c, mainW, B, alone);
  if (wide) body = hcat(body, mainW, sidePanel(c, B), PANEL_W, T, s('│', 'muted'));

  return [header(c), rule(W, T), ...rows(body, B, W), toastRow(c), rule(W, T), footer(c)];
}

function isAlone(m: RoomModel): boolean {
  return m.isHost && m.phase === 'waiting' && m.present.length <= 1;
}

// ── header, story line, status line ───────────────────────────────────────

function header(c: Ctx): Line {
  const { m, ui, o, T } = c;
  const narrow = o.W < 72;
  const left: Line = [
    s(' hnch', undefined, { bold: true }),
    s(glyph('live', T), 'accent'),
    s(narrow ? ` ${m.state.code}` : ` ${m.state.name} · ${m.state.code}`),
  ];
  const conn: Seg = ui.connecting
    ? s(`${glyph('reconnecting', T)} connecting`, 'warning')
    : m.state.connection === 'reconnecting'
      ? s(`${glyph('reconnecting', T)} reconnecting`, 'warning')
      : m.state.connection === 'offline'
        ? s(`${glyph('offline', T)} offline`, 'danger')
        : s(`${glyph('live', T)} live`, 'success');
  const me = m.self;
  const who = !me
    ? ''
    : m.isHost
      ? `${me.name} (host)`
      : me.role === 'viewer'
        ? `${me.name} (watching) · host ${m.host?.name ?? '?'}`
        : `${me.name} · host ${m.host?.name ?? '?'}`;
  const right: Line = [conn, s(term(` · ${who}`, T)), s(' ')];
  if (m.state.password && !narrow) right.unshift(s('password · ', 'muted'));
  return lr(left, right, o.W, T);
}

function storyLine(c: Ctx, w: number): Line {
  const { m, o, T } = c;
  const ph = m.phase;
  if (ph === 'waiting') {
    // §6.6: the stage carries the next story's title; this row says where the room is
    const n = m.queue.length;
    const right = s(`${minutes(o.now - m.state.createdAt)} in `, 'muted');
    const text = n
      ? ` Waiting · ${n} ${n === 1 ? 'story' : 'stories'} up next · ${m.done.length} done`
      : ` Waiting · no stories queued · ${m.done.length} done`;
    return lr([s(term(text, T), undefined, { bold: true })], [right], w, T);
  }
  const r = m.activeRound!;
  const pos = m.storyPosition(r.storyId);
  const st = m.currentStory;
  const nth = revoteDepth(m);
  const text = ` Story ${pos.n} of ${pos.of} · ${st?.key ? `${st.key} · ` : ''}${r.title}${nth}`;
  const clock =
    ph === 'voting'
      ? minutes(o.now - r.startedAt)
      : `took ${minutes((r.revealedAt ?? o.now) - r.startedAt)}`;
  return lr([s(term(text, T), undefined, { bold: true })], [s(`${clock} `, 'muted')], w, T);
}

/** UX-077: re-votes are labelled "2nd vote", never a new round number. */
function revoteDepth(m: RoomModel): string {
  let r = m.activeRound;
  let n = 1;
  while (r?.revoteOf) {
    n++;
    r = m.state.rounds.find((x) => x.id === r!.revoteOf);
  }
  if (n === 1) return '';
  const ord = n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
  return ` · ${ord} vote`;
}

function statusTone(line: string): Seg['tone'] {
  if (line.startsWith('✓')) return 'success';
  if (line.startsWith('≈') || line.startsWith('–')) return 'neutral';
  if (line.startsWith('↔') || line.startsWith('Reconnecting')) return 'warning';
  if (line.startsWith('Offline')) return 'danger';
  return undefined;
}

function statusLine(c: Ctx, w: number): Line {
  const { m, ui, T } = c;
  let line = m.statusLine;
  if (ui.connecting) line = 'Connecting…';
  const tone = statusTone(line);
  return fit(
    [s(' '), s(term(line, T), tone, { bold: tone === 'neutral' || tone === 'success' })],
    w,
    T,
  );
}

// ── base body ──────────────────────────────────────────────────────────────

function baseBody(c: Ctx, w: number, B: number, alone: boolean): Line[] {
  const out: Line[] = [storyLine(c, w), statusLine(c, w)];
  if (alone) {
    out.push(...aloneBlock(c, w, B - 2));
    return out;
  }
  if (B >= 15) out.push(blank(w));
  const ph = c.m.phase;
  const stage =
    ph === 'voting'
      ? votingStage(c, w)
      : ph === 'revealed'
        ? revealedStage(c, w)
        : waitingStage(c, w);
  out.push(...rows(stage, STAGE_ROWS, w));
  out.push(presence(c, w));
  while (out.length < B) out.push(blank(w));
  // the last spare row carries the lab line (what the simulation just did)
  if (B >= 16) {
    const lab = labLine(c, w);
    if (lab) out[B - 1] = lab;
  }
  return out;
}

function labLine(c: Ctx, w: number): Line | undefined {
  const { m, ui, o, T } = c;
  const ev = m.state.lab[0];
  if (!ev || o.now > ui.labUntil) return undefined;
  return fit([s(term(` lab · ${ev.ux ? `${ev.ux} · ` : ''}${ev.text}`, T), 'muted')], w, T);
}

// ── presence (UX-099) ─────────────────────────────────────────────────────

function personGlyph(c: Ctx, p: Person): Seg {
  const { m, T } = c;
  if (p.role === 'viewer') return s(glyph('none', T), 'muted');
  if (!p.online) return s(glyph('offline', T), 'danger');
  if (!p.synced || p.steppedOut) return s(glyph('reconnecting', T), 'warning');
  const r = m.phase === 'voting' ? m.activeRound : undefined;
  if (r && !(p.id in r.votes)) return s(glyph('wait', T), 'muted');
  return s(glyph('live', T), 'accent');
}

function displayName(c: Ctx, p: Person): string {
  return p.id === c.m.state.selfId ? 'you' : p.name;
}

function presence(c: Ctx, w: number): Line {
  const { m, T } = c;
  const people = m.present;
  const voting = m.phase === 'voting';
  const { voted, of } = m.votedCount;
  if (c.o.W < 72) {
    if (voting) {
      const waiting = m.waitingOn.filter((p) => p.id !== m.state.selfId).map((p) => p.name);
      const text = ` ${voted} of ${of}${waiting.length ? ` · waiting ${waiting.join(', ')}` : ' · all in'}`;
      return fit([s(term(text, T))], w, T);
    }
    const names = people.map((p) => displayName(c, p)).join(', ');
    return fit([s(term(` ${people.length} here · ${names}`, T))], w, T);
  }
  const right: Line = voting
    ? [s(`${voted} of ${of} voted `, undefined, { bold: true })]
    : [s(`${people.length} here `, 'muted')];
  const left: Line = [s(' ')];
  const budget = w - lineWidth(right) - 2;
  let used = 1;
  people.forEach((p, i) => {
    const label =
      displayName(c, p) +
      (p.role === 'viewer'
        ? ' watching'
        : !p.online
          ? ' offline'
          : p.steppedOut
            ? ' away'
            : !p.synced
              ? ' syncing'
              : '');
    const piece = 2 + cw(label) + 3;
    if (used + piece > budget && i < people.length) {
      if (!left.some((x) => x.t.startsWith('+'))) left.push(s(`+${people.length - i}`, 'muted'));
      used = budget;
      return;
    }
    left.push(personGlyph(c, p), s(term(` ${label}   `, T)));
    used += piece;
  });
  return lr(left, right, w, T);
}

// ── waiting stage ─────────────────────────────────────────────────────────

function waitingStage(c: Ctx, w: number): Line[] {
  const { m, T } = c;
  const out: Line[] = [];
  const next = m.nextStory;
  const host = m.host?.name ?? 'the host';
  if (!next) {
    out.push([s(' No stories yet', undefined, { bold: true })]);
    out.push([
      s(
        term(
          m.isHost
            ? ' + paste a list to queue them, or ⏎ to just start'
            : " The host hasn't queued stories",
          T,
        ),
        'muted',
      ),
    ]);
  } else {
    const pos = m.storyPosition(next.id);
    out.push([s(term(` ${next.title}`, T), undefined, { bold: true })]);
    out.push([
      s(
        term(` Up next · Story ${pos.n} of ${pos.of}${next.key ? ` · ${next.key}` : ''}`, T),
        'muted',
      ),
    ]);
    out.push(blank(w));
    const after = m.queue.slice(1);
    out.push([s(` After this · ${after.length}`, undefined, { bold: true })]);
    const shown = after.slice(0, 4);
    for (const st of shown) out.push([s(term(`   ${padEnd(st.key, 9)} ${st.title}`, T))]);
    if (after.length > shown.length)
      out.push([s(`   +${after.length - shown.length} more`, 'muted')]);
  }
  while (out.length < 9) out.push(blank(w));
  const last = m.done[m.done.length - 1];
  out.push(
    last
      ? [
          s(
            term(
              ` Last · ${last.key ? `${last.key} ` : ''}${last.title} → ${last.value ?? '–'}`,
              T,
            ),
            'muted',
          ),
        ]
      : blank(w),
  );
  out.push(
    m.isHost
      ? [s(term(` ⏎ ${m.primary.label}`, T), 'accent', { bold: true })]
      : [
          s(
            term(` Waiting for ${host} to start · stories added by anyone show up here live`, T),
            'muted',
          ),
        ],
  );
  return out.map((l) => fit(l, w, T));
}

/** Host alone: the invite panel is the empty state (QR inline at ≥80×24). */
function aloneBlock(c: Ctx, w: number, h: number): Line[] {
  const { m, o, T } = c;
  const qr = o.ascii ? undefined : qrRows(o.webUrl);
  const showQr = qr && w >= 80 && h >= qr.rows.length;
  const leftW = showQr ? w - 31 - 2 : w;
  const code = m.state.code.replace('-', '');
  const left: Line[] = [
    blank(leftW),
    [s(" 1 here · you're the host", undefined, { bold: true })],
    [s(' People join in one tap from the link', 'muted')],
    [s(' Code      ', 'muted'), s(m.state.code, undefined, { bold: true })],
    [s(' Link      ', 'muted'), s(o.webUrl, 'accent')],
    [s(' Terminal  ', 'muted'), s(`npx -y @xauyxau/hnch join ${code}`)],
    [s(showQr ? ' c copy link' : ' c copy link · i shows the QR', 'muted')],
    blank(leftW),
  ];
  const q = m.queue;
  left.push([s(` Up next · ${q.length}`, undefined, { bold: true })]);
  q.slice(0, 3).forEach((st, i) =>
    left.push([s(term(` ${i === 0 ? glyph('sel', T) : ' '} ${padEnd(st.key, 9)} ${st.title}`, T))]),
  );
  if (q.length > 3) left.push([s(`   +${q.length - 3} more`, 'muted')]);
  if (q.length === 0) left.push([s(' + paste a list to queue stories', 'muted')]);
  while (left.length < h - 2) left.push(blank(leftW));
  left.splice(h - 2);
  left.push([s(' '), personGlyph(c, m.self!), s(' you · 1 here')]);
  left.push(
    showQr ? [s(qr.real ? ' scan to join →' : ' QR placeholder →', 'muted')] : blank(leftW),
  );
  if (!showQr) return rows(left, h, w).map((l) => fit(l, w, T));
  const right = qr.rows.map((r) => [s(r)]);
  return hcat(rows(left, h, leftW), leftW, rows(right, h, 31), 31, T, s('  '));
}

// ── voting stage ──────────────────────────────────────────────────────────

interface Faces {
  cards: string[];
  mine: string | undefined;
  pendingSet: Set<string>;
  cursor: number | null;
}

function faces(c: Ctx): Faces {
  const { m, ui } = c;
  const cards = m.scale.cards;
  const r = m.activeRound;
  const mine = r?.votes[m.state.selfId];
  const p = ui.pending.toLowerCase();
  const pendingSet = new Set(p ? cards.filter((x) => x.toLowerCase().startsWith(p)) : []);
  return { cards, mine, pendingSet, cursor: ui.cursor };
}

function boxChars(kind: 'normal' | 'mine' | 'pending', ascii: boolean) {
  if (ascii)
    return kind === 'mine'
      ? { tl: '#', tr: '#', bl: '#', br: '#', h: '=', v: '#' }
      : kind === 'pending'
        ? { tl: '.', tr: '.', bl: '.', br: '.', h: '.', v: ':' }
        : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' };
  return kind === 'mine'
    ? { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' }
    : kind === 'pending'
      ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '╌', v: '╎' }
      : { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' };
}

function deckBoxes(c: Ctx, w: number, f: Faces): Line[] | undefined {
  const { T, m } = c;
  const viewer = m.self?.role === 'viewer';
  const fw = Math.max(...f.cards.map(cw));
  const boxW = fw + 4;
  const passInner = ' pass ';
  const passW = cw(passInner) + 2;
  const n = f.cards.length;
  let lead = 2;
  let gap = 2;
  const total = () => lead + n * boxW + (n - 1) * gap + 4 + passW;
  if (total() > w) {
    gap = 1;
    lead = 1;
  }
  if (total() > w) return undefined;
  const lines: Line[] = [
    [s(' '.repeat(lead))],
    [s(' '.repeat(lead))],
    [s(' '.repeat(lead))],
    [s(' '.repeat(lead))],
  ];
  const put = (
    label: string,
    kind: 'normal' | 'mine' | 'pending',
    inner: string,
    isCursor: boolean,
    i: number,
    last: boolean,
  ) => {
    const b = boxChars(kind, T.ascii);
    const tone: Tone | undefined = viewer
      ? 'muted'
      : kind === 'mine'
        ? 'accent'
        : kind === 'pending'
          ? 'warning'
          : undefined;
    const bold = kind === 'mine';
    const gapS = last ? '' : ' '.repeat(i === n - 1 ? 4 : gap);
    const innerW = cw(inner);
    lines[0]!.push(s(b.tl + b.h.repeat(innerW) + b.tr, tone, { bold }), s(gapS));
    lines[1]!.push(
      s(b.v, tone, { bold }),
      s(inner, tone, { bold, inverse: isCursor }),
      s(b.v, tone, { bold }),
      s(gapS),
    );
    lines[2]!.push(s(b.bl + b.h.repeat(innerW) + b.br, tone, { bold }), s(gapS));
    const mark = isCursor ? glyph('up', T) : label;
    const half = Math.floor((innerW + 2 - cw(mark)) / 2);
    lines[3]!.push(
      s(' '.repeat(half)),
      s(mark, isCursor ? 'accent' : 'muted'),
      s(' '.repeat(innerW + 2 - half - cw(mark))),
      s(gapS),
    );
  };
  f.cards.forEach((face, i) => {
    const kind = f.mine === face ? 'mine' : f.pendingSet.has(face) ? 'pending' : 'normal';
    put('', kind, ` ${padStart(face, fw)} `, f.cursor === i, i, false);
  });
  put('-', f.mine === PASS ? 'mine' : 'normal', passInner, f.cursor === n, n, true);
  return lines.map((l) => fit(l, w, T));
}

function deckFlat(c: Ctx, w: number, f: Faces): Line[] {
  const { T, m } = c;
  const viewer = m.self?.role === 'viewer';
  const deck: Line = [s(' ')];
  const marks: Line = [s(' ')];
  const all = [...f.cards, PASS];
  all.forEach((face, i) => {
    const label = face === PASS ? '- pass' : face;
    const isMine = f.mine === face;
    const pend = f.pendingSet.has(face);
    const cur = f.cursor === i;
    const t = `[${label}]`;
    deck.push(
      s(t, viewer ? 'muted' : isMine ? 'accent' : pend ? 'warning' : undefined, {
        bold: isMine,
        inverse: isMine || cur,
      }),
      s(' '),
    );
    const mk = cur ? glyph('up', T) : isMine ? glyph('live', T) : pend ? glyph('ell', T) : ' ';
    const half = Math.floor((cw(t) - cw(mk)) / 2);
    marks.push(s(' '.repeat(half)), s(mk, 'accent'), s(' '.repeat(cw(t) - half - cw(mk) + 1)));
  });
  return [fit(deck, w, T), fit(marks, w, T)];
}

function votingStage(c: Ctx, w: number): Line[] {
  const { m, ui, T } = c;
  const f = faces(c);
  const out: Line[] = [];
  const prev = m.previousOfRevote;
  if (prev) {
    const parts = prev.outcome.columns
      .filter((x) => x.ids.length)
      .map((x) => `${x.face} ×${x.ids.length}`);
    if (prev.outcome.passes.length) parts.push(`pass ×${prev.outcome.passes.length}`);
    out.push(fit([s(term(` Re-vote · last time: ${parts.join(' · ')}`, T), 'muted')], w, T));
  } else out.push(blank(w));
  const boxes = deckBoxes(c, w, f);
  if (boxes) out.push(...boxes);
  else out.push(blank(w), ...deckFlat(c, w, f), blank(w));
  out.push(blank(w));
  const viewer = m.self?.role === 'viewer';
  const exact = ui.pending ? flushKey(f.cards, ui.pending) : undefined;
  const longer = [...f.pendingSet].filter((x) => x !== exact);
  let hint: string;
  if (viewer) hint = "You're watching · w to vote instead";
  else if (ui.pending)
    hint = exact
      ? `typing ${ui.pending}… ⏎ votes ${exact} now, or keep typing for ${longer.join(', ')}`
      : `typing ${ui.pending}… keep typing: ${longer.join(', ')}`;
  else if (m.state.settleUntil)
    hint = "Everyone's in · revealing in a moment · you can still change your card";
  else if (!f.mine) hint = 'Type the card face to vote · - pass · ←→ then space picks any card';
  else hint = 'Change your card any time until the reveal · ⌫ clears it';
  out.push(fit([s(term(` ${hint}`, T), ui.pending ? 'warning' : 'muted')], w, T));
  if (m.isHost) {
    const p = m.primary;
    out.push(
      fit(
        [
          s(
            term(
              p.enabled
                ? ` ⏎ ${lower(p.label)} now, or let it auto-reveal when everyone is in`
                : ` ${p.label}`,
              T,
            ),
            'muted',
          ),
        ],
        w,
        T,
      ),
    );
  }
  return out;
}

// ── revealed stage (named histogram, UX-035 / UX-036) ───────────────────────

function revealedStage(c: Ctx, w: number): Line[] {
  const { m, T } = c;
  const o = m.outcome!;
  const r = m.activeRound!;
  const host = m.isHost;
  const pick = m.acceptValue;
  const names = (ids: string[]) =>
    ids.map((id) => (id === m.state.selfId ? 'you' : m.nameOf(id))).join(', ');
  const fw = Math.max(4, ...o.columns.map((x) => cw(x.face)));
  const barMax = w >= 76 ? 12 : 8;
  const maxCount = Math.max(1, ...o.columns.map((x) => x.ids.length), o.passes.length);
  const unit = Math.max(1, Math.floor(barMax / maxCount));
  const labelW = 12;
  const fixed = 3 + fw + 2 + barMax + 2 + 2 + 2;
  const nameW = Math.max(6, w - fixed - labelW - 1);
  const lo = o.kind === 'split' ? o.min : o.low?.value;
  const hi = o.kind === 'split' ? o.max : o.high?.value;
  const histo: Line[] = o.columns.map((col) => {
    const sel = host && col.face === pick;
    const sug = col.face === o.suggestion;
    const n = col.ids.length;
    const bar = glyph('bar', T).repeat(n * unit);
    const label =
      sug && o.kind === 'agreed' && o.n >= 2
        ? `${glyph('ok', T)} hnch'd`
        : sug
          ? 'suggested'
          : col.face === lo
            ? 'low'
            : col.face === hi
              ? 'high'
              : '';
    const tone: Tone | undefined = sel ? 'accent' : undefined;
    return fit(
      [
        s(' '),
        s(sel ? glyph('sel', T) : ' ', 'accent'),
        s(sug ? glyph('up', T) : ' ', 'accent'),
        s(' '),
        s(padStart(col.face, fw), tone, { bold: sel || sug, inverse: sel }),
        s('  '),
        s(padEnd(bar, barMax), sug ? 'accent' : n ? undefined : 'muted'),
        s('  '),
        s(n ? padStart(String(n), 2) : '  ', 'muted'),
        s('  '),
        s(padEnd(trunc(names(col.ids), nameW, T), nameW)),
        s(' '),
        s(padStart(label, labelW - 2), sug ? 'accent' : 'muted'),
        s(' '),
      ],
      w,
      T,
    );
  });
  const passN = o.passes.length;
  histo.push(
    fit(
      [
        s('    '),
        s(padStart('Pass', fw), 'muted'),
        s('  '),
        s(padEnd(passN ? '·'.repeat(passN * unit) : '', barMax), 'muted'),
        s('  '),
        s(passN ? padStart(String(passN), 2) : '  ', 'muted'),
        s('  '),
        s(trunc(passN ? names(o.passes) : glyph('none', T), nameW, T), 'muted'),
      ],
      w,
      T,
    ),
  );
  // outlier / detail line
  let detail: string;
  if (o.kind === 'close')
    detail = [
      o.low && `Low ${o.low.value} ${o.low.names.join(', ')}`,
      o.high && `High ${o.high.value} ${o.high.names.join(', ')}`,
    ]
      .filter(Boolean)
      .join(' · ');
  else if (o.kind === 'split') detail = `Low ${o.min} · High ${o.max} · pick a value or re-vote`;
  else if (o.kind === 'agreed') detail = `Everyone said ${o.suggestion}`;
  else if (o.kind === 'one') detail = '1 vote is not enough to call it';
  else detail = 'Nobody voted · re-vote or skip the story';
  if (o.didntVote.length) detail += ` · didn't vote: ${names(o.didntVote)}`;
  const extra: Line[] = [fit([s(term(`   ${detail}`, T), 'muted')], w, T)];
  const hostName = m.host?.name ?? 'the host';
  const p = m.primary;
  const hint = host
    ? p.action === 'accept'
      ? `⏎ ${lower(p.label)} · ←→ pick another · r re-vote · s skip story`
      : '⏎ re-vote · ←→ pick a value to accept anyway · s skip story'
    : r.hostPick
      ? `${hostName} is about to accept ${r.hostPick}`
      : `Waiting for ${hostName} to accept or re-vote`;
  extra.push(fit([s(term(`   ${hint}`, T), 'muted')], w, T));
  const room = STAGE_ROWS - histo.length;
  return [...histo, ...extra.slice(0, Math.max(0, room))];
}

// ── side panel at ≥100 columns: People · Up next · Done ─────────────────────

function sidePanel(c: Ctx, h: number): Line[] {
  const { m, T } = c;
  const w = PANEL_W;
  const out: Line[] = [];
  out.push([s(` People · ${m.present.length}`, undefined, { bold: true })]);
  for (const p of peopleRows(m).slice(0, 7))
    out.push([
      s(' '),
      personGlyph(c, p),
      s(
        term(
          ` ${displayName(c, p)}${p.id === m.state.hostId ? ' · host' : ''}${p.role === 'viewer' ? ' · watching' : ''}`,
          T,
        ),
      ),
    ]);
  out.push(blank(w));
  const q = m.queue;
  out.push([s(` Up next · ${q.length}`, undefined, { bold: true })]);
  for (const st of q.slice(0, 4)) out.push([s(term(` ${padEnd(st.key, 9)} ${st.title}`, T))]);
  if (q.length > 4) out.push([s(` +${q.length - 4} more`, 'muted')]);
  out.push(blank(w));
  out.push([s(` Done · ${m.done.length}`, undefined, { bold: true })]);
  const done = m.done.slice(-Math.max(1, h - out.length));
  for (const st of done)
    out.push(
      lr(
        [s(term(` ${padEnd(st.key, 9)} ${st.title}`, T))],
        [s(st.value ?? '–', 'accent', { bold: true }), s(' ')],
        w,
        T,
      ),
    );
  return rows(
    out.map((l) => fit(l, w, T)),
    h,
    w,
  );
}

// ── overlays ───────────────────────────────────────────────────────────────

function overlayBody(c: Ctx, t: Mode, w: number, B: number): Line[] {
  const { T } = c;
  const boxH = B - 3;
  const { title, lines } = overlayContent(c, t, w - 6, boxH - 2);
  const bx = indent(box(title, lines, w - 2, boxH, T));
  // UX-105: the story, the status line and presence stay visible around any overlay
  return [storyLine(c, w), statusLine(c, w), ...bx, presence(c, w)];
}

function inviteBody(c: Ctx, w: number, h: number, bordered: boolean): Line[] {
  const { m, o, T } = c;
  const inner = bordered ? w - 6 : w;
  const innerH = bordered ? h - 2 : h;
  const qr = o.ascii ? undefined : qrRows(o.webUrl);
  const showQr = qr && innerH >= qr.rows.length && inner >= 31 + 26;
  const leftW = showQr ? inner - 31 - 2 : inner;
  const code = m.state.code.replace('-', '');
  const left: Line[] = [
    [s(' Invite people', undefined, { bold: true })],
    [s(' They join in one tap from the link', 'muted')],
    blank(leftW),
    [s(' Code', 'muted')],
    [s(` ${m.state.code}`, undefined, { bold: true })],
    [s(' Link', 'muted')],
    [s(` ${o.webUrl}`, 'accent')],
    [s(' Terminal', 'muted')],
    [s(` npx -y @xauyxau/hnch join ${code}`)],
    blank(leftW),
    [s(' c copy link', undefined, { bold: true })],
    [s(term(' no clipboard? the link above is the copy', T), 'muted')],
  ];
  if (m.state.password) left.push([s(' Password room · share the password separately', 'muted')]);
  if (!showQr && !o.ascii)
    left.push([s(` QR needs a taller terminal (${31 + 4}×${18 + 6})`, 'muted')]);
  if (o.ascii) left.push([s(' QR hidden in ASCII mode', 'muted')]);
  let content: Line[];
  if (showQr) {
    content = hcat(
      rows(left, innerH, leftW),
      leftW,
      qr.rows.map((r) => [s(r)]),
      31,
      T,
      s('  '),
    );
  } else content = left.map((l) => fit(l, inner, T));
  if (!bordered)
    return rows(
      content.map((l) => fit(l, w, T)),
      h,
      w,
    );
  return indent(box('Invite', content, w - 2, h, T));
}

function scrollWindow<T>(items: T[], cursor: number, h: number): { start: number; slice: T[] } {
  const start = Math.max(0, Math.min(cursor - Math.floor(h / 2), items.length - h));
  return { start, slice: items.slice(start, start + h) };
}

function selRow(c: Ctx, on: boolean, text: string, w: number, tone?: Tone, right?: string): Line {
  const { T } = c;
  const left: Line = [
    s(on ? glyph('sel', T) : ' ', 'accent'),
    s(' '),
    s(term(text, T), tone, { inverse: on }),
  ];
  return right ? lr(left, [s(term(right, T), 'muted')], w, T) : fit(left, w, T);
}

export function overlayContent(
  c: Ctx,
  t: Mode,
  w: number,
  h: number,
): { title: string; lines: Line[] } {
  const { m, T } = c;
  switch (t.kind) {
    case 'help':
      return { title: 'Keys', lines: helpLines(c, w).slice(t.scroll, t.scroll + h) };
    case 'add': {
      const parsed = RoomModel.parseStories(t.text);
      const textLines = t.text.split('\n');
      const shown = textLines.slice(-Math.max(1, h - 5));
      const lines: Line[] = [
        [s('One story per line, paste many at once. Keys like PROJ-12 are kept.', 'muted')],
        blank(w),
        ...shown.map((l, i) =>
          i === shown.length - 1
            ? [s(term(l, T)), s(' ', undefined, { inverse: true })]
            : [s(term(l, T))],
        ),
      ];
      while (lines.length < h - 2) lines.push(blank(w));
      lines.push(blank(w));
      lines.push([
        s(
          parsed.length
            ? term(
                `${parsed.length} ${parsed.length === 1 ? 'story' : 'stories'}: ${parsed.map((p) => p.key || p.title).join(', ')}`,
                T,
              )
            : 'Nothing to add yet',
          parsed.length ? 'accent' : 'muted',
        ),
      ]);
      return { title: 'Add stories', lines };
    }
    case 'people': {
      const ppl = peopleRows(m);
      const { start, slice } = scrollWindow(ppl, t.cursor, h - 1);
      const lines = slice.map((p, i) => {
        const on = start + i === t.cursor;
        const g = personGlyph(c, p);
        const role = p.role === 'viewer' ? 'watching' : 'voter';
        const tags = [p.id === m.state.hostId ? 'host' : '', p.device, role]
          .filter(Boolean)
          .join(' · ');
        return lr(
          [
            s(on ? glyph('sel', T) : ' ', 'accent'),
            s(' '),
            g,
            s(' '),
            s(term(displayName(c, p) === 'you' ? `${p.name} (you)` : p.name, T), undefined, {
              inverse: on,
            }),
          ],
          [s(tags, 'muted')],
          w,
          T,
        );
      });
      lines.push([
        s(
          ppl.length > h - 1
            ? `${t.cursor + 1} of ${ppl.length} · ↑↓ scrolls`
            : `${ppl.length} here`,
          'muted',
        ),
      ]);
      return { title: `People · ${ppl.length}`, lines };
    }
    case 'stories': {
      const all = storyRows(m);
      if (!all.length)
        return {
          title: 'Stories',
          lines: [[s('No stories yet · + paste a list to queue them', 'muted')]],
        };
      const { start, slice } = scrollWindow(all, t.cursor, h - 1);
      const lines = slice.map((r, i) =>
        selRow(
          c,
          start + i === t.cursor,
          `${padEnd(r.section, 8)} ${padEnd(r.story.key, 9)} ${r.story.title}`,
          w,
          r.section === 'Done' || r.section === 'Skipped' ? 'muted' : undefined,
          r.section === 'Done'
            ? `→ ${r.story.value ?? '–'}`
            : r.section === 'Skipped'
              ? 'skipped'
              : '',
        ),
      );
      lines.push([
        s(`${t.cursor + 1} of ${all.length}${all.length > h - 1 ? ' · ↑↓ scrolls' : ''}`, 'muted'),
      ]);
      return { title: `Stories · ${m.queue.length} up next · ${m.done.length} done`, lines };
    }
    case 'menu': {
      const items = menuItems(m);
      return {
        title: 'Menu',
        lines: items.map((it, i) =>
          selRow(
            c,
            i === t.cursor,
            it.label,
            w,
            it.tone === 'danger' ? 'danger' : undefined,
            it.key ? it.key : 'confirm',
          ),
        ),
      };
    }
    case 'confirm': {
      const who = t.arg ? m.nameOf(t.arg) : '';
      const next = m.present.find((p) => p.id !== m.state.selfId && p.online && p.synced);
      const [q, body, yes] =
        t.action === 'end'
          ? [
              `End ${m.state.name} for everyone?`,
              'Everyone goes Home and sees the summary. This cannot be undone.',
              'End for everyone',
            ]
          : t.action === 'remove'
            ? [
                `Remove ${who} from ${m.state.name}?`,
                `${who} sees "${m.self?.name ?? 'The host'} removed you" and needs you to rejoin.`,
                `Remove ${who}`,
              ]
            : [
                `Leave ${m.state.name}?`,
                `${next?.name ?? 'Someone'} becomes host so the room keeps going.`,
                'Leave',
              ];
      const btn = (label: string, on: boolean, danger: boolean): Seg[] => [
        s(on ? glyph('sel', T) : ' ', danger ? 'danger' : 'accent'),
        s(`[ ${label} ]`, danger ? 'danger' : undefined, { inverse: on, bold: on }),
      ];
      return {
        title: 'Confirm',
        lines: [
          [s(q, undefined, { bold: true })],
          [s(term(body, T), 'muted')],
          blank(w),
          [...btn('Cancel', t.cursor === 0, false), s('   '), ...btn(yes, t.cursor === 1, true)],
          blank(w),
          [s(term('←→ choose · ⏎ confirm · esc cancel (never a single key)', T), 'muted')],
        ],
      };
    }
    case 'settings': {
      const items = settingItems(m);
      const scale = SCALES[SCALE_IDS[t.scaleIdx] ?? 'fibonacci']!;
      const lines: Line[] = items.map((id, i) => {
        const on = i === t.cursor;
        if (id === 'scale')
          return selRow(
            c,
            on,
            `Scale     ← ${scale.label} →   ${scale.cards.join(' ')}`,
            w,
            undefined,
            scale.id === m.state.scaleId
              ? 'in use'
              : m.phase === 'voting'
                ? '⏎ applies next story'
                : '⏎ apply',
          );
        if (id === 'password')
          return selRow(
            c,
            on,
            `Password  ${m.state.password ? 'on' : 'off'}`,
            w,
            undefined,
            m.state.password ? '⏎ turn off' : '⏎ set one',
          );
        return selRow(c, on, `Your name ${m.self?.name ?? ''}`, w, undefined, '⏎ edit');
      });
      lines.push(blank(w));
      if (m.phase === 'voting')
        lines.push([
          s('The round keeps going above; the reveal shows in the status line.', 'muted'),
        ]);
      lines.push([
        s('Scales, avatar colour and defaults live in `hnch config`, not in the Room.', 'muted'),
      ]);
      return { title: m.isHost ? 'Room settings' : 'Settings', lines };
    }
    case 'password':
      return {
        title: 'Room password',
        lines: [
          [s('People need it to join. It is never shown and never goes in argv.', 'muted')],
          blank(w),
          [
            s('Password  '),
            s((T.ascii ? '*' : '•').repeat(t.value.length)),
            s(' ', undefined, { inverse: true }),
          ],
          blank(w),
          [s(term('⏎ set · ⌫ delete · esc cancel', T), 'muted')],
        ],
      };
    case 'name':
      return {
        title: 'Your name',
        lines: [
          [s('Shown to everyone in this room.', 'muted')],
          blank(w),
          [s('Name  '), s(term(t.value, T)), s(' ', undefined, { inverse: true })],
          blank(w),
          [s(term('⏎ save · esc cancel', T), 'muted')],
        ],
      };
    case 'export': {
      const sum = sessionSummary(m);
      const lines: Line[] = sum.text
        .split('\n')
        .map((l, i) => [s(term(l.replace('\t', '  →  '), T), undefined, { bold: i === 0 })]);
      lines.push(blank(w), [s('c copy · esc close · only revealed stories are exported', 'muted')]);
      return { title: 'Export results', lines };
    }
    case 'lab': {
      const ev = m.state.lab[0];
      const lines: Line[] = LAB_ITEMS.map((it, i) =>
        selRow(
          c,
          i === t.cursor,
          `${i + 1}  ${it.id === 'auto' ? `Peers vote on their own: ${m.state.peersAutoVote ? 'on' : 'off'}` : it.label}`,
          w,
          undefined,
          it.ux,
        ),
      );
      lines.push(blank(w));
      if (ev) lines.push([s(term(`last: ${ev.text}`, T), 'muted')]);
      return { title: 'Lab · trust simulations (prototype only)', lines };
    }
    case 'invite':
      return { title: 'Invite', lines: [] };
  }
}

const PHASE_LABEL = { waiting: 'Waiting', voting: 'Voting', revealed: 'Revealed' } as const;
const PRIMARY_LABEL = { waiting: 'start', voting: 'reveal', revealed: 'accept · next' } as const;

/** `?` sheet, generated from the registry (R-51), grouped by phase. */
export function helpLines(c: Ctx, w: number): Line[] {
  const { m, T } = c;
  const isVoter = m.self?.role === 'voter';
  const label = (id: string, l: string, ph: keyof typeof PRIMARY_LABEL) =>
    id === 'primary' ? `${PRIMARY_LABEL[ph]} (host)` : l.split(' (')[0]!.toLowerCase();
  const item = (c2: (typeof COMMANDS)[number], ph: keyof typeof PRIMARY_LABEL) =>
    c2.id === 'vote'
      ? 'type a card face'
      : c2.keys.length
        ? `${c2.keys.join('')} ${label(c2.id, c2.label, ph)}`
        : `menu: ${c2.label.toLowerCase()} (confirm)`;
  const out: Line[] = [];
  const wrap = (head: string, items: string[], current: boolean) => {
    let line = '';
    let first = true;
    const flush = () => {
      out.push([
        s(current && first ? glyph('sel', T) : ' ', 'accent'),
        s(padEnd(first ? head : '', 10), undefined, { bold: current }),
        s(term(line, T)),
      ]);
      first = false;
      line = '';
    };
    for (const it of items) {
      const add = line ? ` · ${it}` : it;
      if (cw(line + add) > w - 12 && line) flush();
      line += line ? ` · ${it}` : it;
    }
    if (line || first) flush();
  };
  for (const ph of ['waiting', 'voting', 'revealed'] as const) {
    const cmds = commandsFor(ph, true, true, 'cli').filter(
      (x) => x.phases !== 'any' || x.id === 'primary',
    );
    const extra =
      ph === 'voting' ? ['⌫ clear', '←→ space any card'] : ph === 'waiting' ? ['c copy link'] : [];
    wrap(PHASE_LABEL[ph], [...cmds.map((x) => item(x, ph)), ...extra], m.phase === ph);
  }
  const any = COMMANDS.filter(
    (x) => x.phases === 'any' && x.surfaces.includes('cli') && x.id !== 'primary',
  );
  wrap('Anytime', [...any.map((x) => item(x, 'waiting')), 'ctrl+l lab'], false);
  out.push(blank(w));
  out.push([
    s(
      term(
        'While voting, letters are card faces first (T-shirt M, Risk C); esc opens the menu.',
        T,
      ),
      'muted',
    ),
  ]);
  out.push([
    s(
      term(
        `You are ${m.isHost ? 'the host' : isVoter ? 'a voter' : 'watching'}: host-only keys do nothing for others.`,
        T,
      ),
      'muted',
    ),
  ]);
  return out.map((l) => fit(l, w, T));
}

// ── toast row (reserved; never shifts layout) ──────────────────────────────

function toastRow(c: Ctx): Line {
  const { m, ui, o, T } = c;
  const w = o.W;
  if (ui.flash && o.now < ui.flash.until) {
    const tone: Tone =
      ui.flash.tone === 'success'
        ? 'success'
        : ui.flash.tone === 'warning'
          ? 'warning'
          : ui.flash.tone === 'danger'
            ? 'danger'
            : 'neutral';
    return fit([s(' '), s(term(ui.flash.text, T), tone)], w, T);
  }
  const n = m.state.notices[0];
  if (n && o.now < n.expiresAt) {
    const tone: Tone =
      n.kind === 'success'
        ? 'success'
        : n.kind === 'warning'
          ? 'warning'
          : n.kind === 'danger'
            ? 'danger'
            : 'neutral';
    const segs: Line = [s(' '), s(term(n.text, T), tone, { bold: n.kind !== 'info' })];
    if (n.undoLabel) {
      const p = m.state.pending[m.state.pending.length - 1];
      const left = p ? Math.max(0, Math.ceil((p.commitAt - o.now) / 1000)) : 0;
      segs.push(
        s(term(` · u ${n.undoLabel.toLowerCase()} `, T), 'muted'),
        s(
          glyph('tick', T).repeat(left) + glyph('untick', T).repeat(5 - Math.min(5, left)),
          'muted',
        ),
      );
    }
    return fit(segs, w, T);
  }
  // no spare row at this height: the lab line uses the toast row
  if (o.H - 6 < 16) {
    const lab = labLine(c, w);
    if (lab) return lab;
  }
  return blank(w);
}

// ── footer (R-46: one row, registry-generated, never wraps) ──────────────────

export function footerParts(c: Ctx): {
  left: { t: string; tone?: Tone; bold?: boolean }[];
  right: string[];
} {
  const { m, ui, o } = c;
  const t = top(ui);
  if (t) {
    const keys: Record<Mode['kind'], string[]> = {
      help: ['↑↓ scroll'],
      invite: ['c copy link'],
      add: ['⏎ new line', '⏎ on empty line adds', 'ctrl+d adds'],
      people: m.isHost ? ['↑↓ move', 'h make host', 'x remove'] : ['↑↓ move'],
      stories: m.isHost
        ? ['↑↓ move', 'n do next', 'x remove', 'b bring back', '+ add']
        : ['↑↓ move', '+ add'],
      menu: ['↑↓ move', '⏎ choose', 'or its key'],
      confirm: ['←→ choose', '⏎ confirm'],
      settings: ['↑↓ move', '←→ change scale', '⏎ choose'],
      password: ['⏎ set'],
      name: ['⏎ save'],
      export: ['c copy'],
      lab: ['↑↓ move', '⏎ run', '1–9'],
    };
    return {
      left: keys[t.kind].map((x) => ({ t: x })),
      right: [
        t.kind === 'confirm' || t.kind === 'password' || t.kind === 'name' || t.kind === 'add'
          ? 'esc cancel'
          : 'esc close',
      ],
    };
  }
  const ph = m.phase;
  const isVoter = m.self?.role === 'voter';
  const p = m.primary;
  const hints = footerHints(ph, m.isHost, isVoter, o.W, lower(p.label));
  const right: string[] = hints.filter((h) => h === '? help' || h === 'q leave');
  let left: { t: string; tone?: Tone; bold?: boolean }[] = hints
    .filter((h) => !right.includes(h))
    .filter((h) => h !== 'u undo' || m.state.pending.length > 0)
    // the registry's display key is '←'; the command is the ←/→ pair
    .map((h) => (h.startsWith('← ') ? '←→ pick' : h))
    .filter((h) => !(h === 'r re-vote' && p.action === 'revote'))
    .map((h) =>
      h.startsWith('⏎ ')
        ? p.enabled
          ? { t: h, tone: 'accent' as Tone, bold: true }
          : { t: h, tone: 'muted' as Tone }
        : { t: h },
    );
  if (ph === 'voting' && isVoter && ui.pending) {
    const exact = flushKey(m.scale.cards, ui.pending);
    const vote = {
      t: exact ? `⏎ vote ${exact}` : `typing ${ui.pending}…`,
      tone: 'warning' as Tone,
      bold: true,
    };
    left = [vote, ...left.filter((x) => !x.t.startsWith('⏎ '))];
  }
  if (ph === 'voting') right.unshift('esc menu');
  return { left, right };
}

/** "Accept 8 · Next: PROJ-102" → "accept 8 · Next: PROJ-102" (first letter only). */
function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** One cell of margin either side of a box. */
function indent(ls: Line[]): Line[] {
  for (const l of ls) {
    l.unshift(s(' '));
    l.push(s(' '));
  }
  return ls;
}

function footer(c: Ctx): Line {
  const { o, T } = c;
  const { left, right } = footerParts(c);
  const rightText = right.join('   ');
  const budget = o.W - cw(rightText) - 4;
  const kept = [...left];
  const width = () => kept.reduce((a, x, i) => a + cw(term(x.t, T)) + (i ? 3 : 0), 0);
  while (kept.length > 1 && width() > budget) kept.pop();
  const segs: Line = [s(' ')];
  kept.forEach((x, i) => {
    if (i) segs.push(s('   '));
    segs.push(s(term(x.t, T), x.tone, { bold: x.bold }));
  });
  return lr(segs, [s(term(rightText, T), 'muted'), s(' ')], o.W, T);
}

// ── terminal states: removed (UX-010), ended ───────────────────────────────

function terminalMessage(c: Ctx): { title: string; body: string } | undefined {
  const { m } = c;
  const me = m.self;
  if (me?.removedBy && me.leftAt) {
    return {
      title: `${m.nameOf(me.removedBy)} removed you from ${m.state.name}`,
      body: 'Rejoining needs the host. Press any key.',
    };
  }
  if (m.state.ended) {
    return {
      title: `${m.host?.name ?? 'The host'} ended ${m.state.name}`,
      body: 'The summary prints below when this screen closes. Press any key.',
    };
  }
  return undefined;
}

function terminalFrame(c: Ctx, msg: { title: string; body: string }): Line[] {
  const { o, T } = c;
  const W = o.W;
  const FH = o.H - 1;
  const mid = Math.floor(FH / 2) - 1;
  const out: Line[] = [];
  for (let i = 0; i < FH; i++) {
    if (i === mid) out.push(fit([s(`  ${term(msg.title, T)}`, undefined, { bold: true })], W, T));
    else if (i === mid + 1) out.push(fit([s(`  ${term(msg.body, T)}`, 'muted')], W, T));
    else out.push(blank(W));
  }
  out[0] = header(c);
  out[1] = rule(W, T);
  return out;
}
