/**
 * PROTOTYPE (#643), throwaway. Not production code: no tests, no Yjs, no relay.
 *
 * A framework-free, in-memory model of one hnch Room as #643 / PR #525 §2.1 and
 * §6 describe it: one phase-driven Room (waiting / voting / revealed), the
 * outcome table (Agreed / Close / Split / 1 vote / No votes), the settle
 * window before auto-reveal, the agreed estimate per story, and a "trust lab"
 * that simulates the critical bugs (reload, offline host, double start).
 *
 * The same file is copied verbatim to packages/cli/src/prototype-643/ so the
 * web and terminal prototypes agree. Edit both copies or neither.
 *
 * Usage: `const m = new RoomModel(); m.subscribe(fn); setInterval(() => m.tick(Date.now()), 100)`.
 * Every mutation calls the listeners. Read `m.state` and the derived getters.
 */

// ── Scales ──────────────────────────────────────────────────────────────

export interface ProtoScale {
  id: string;
  label: string;
  cards: string[];
  numeric: boolean;
}

export const PASS = 'hnch_abstain'; // the real sentinel; never rendered raw (UX-039)

export const SCALES: Record<string, ProtoScale> = {
  fibonacci: {
    id: 'fibonacci',
    label: 'Fibonacci',
    cards: ['0', '1', '2', '3', '5', '8', '13', '21'],
    numeric: true,
  },
  't-shirt': {
    id: 't-shirt',
    label: 'T-shirt',
    cards: ['XS', 'S', 'M', 'L', 'XL'],
    numeric: false,
  },
  'powers-of-2': {
    id: 'powers-of-2',
    label: 'Powers of 2',
    cards: ['1', '2', '4', '8', '16', '32', '64'],
    numeric: true,
  },
  linear: {
    id: 'linear',
    label: 'Linear (1–10)',
    cards: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    numeric: true,
  },
  risk: { id: 'risk', label: 'Risk', cards: ['Low', 'Medium', 'High', 'Critical'], numeric: false },
  'custom-team': {
    id: 'custom-team',
    label: 'Team hours',
    cards: ['½', '1', '2', '4', '8', '16'],
    numeric: false,
  },
};

// ── Avatar dots (§5.1 table: render-time variants that reach ≥3:1) ─────────

export type AvatarKey =
  | 'racing-green'
  | 'dijon'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'pink'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'graphite';

export const AVATAR_VARIANTS: Record<
  AvatarKey,
  { base: string; light: string; lightInk: string; dark: string; darkInk: string }
> = {
  'racing-green': {
    base: '#0B3D2E',
    light: '#0B3D2E',
    lightInk: '#FFFFFF',
    dark: '#497866',
    darkInk: '#FFFFFF',
  },
  dijon: {
    base: '#C9A227',
    light: '#AE8A0C',
    lightInk: '#161716',
    dark: '#C9A227',
    darkInk: '#161716',
  },
  blue: {
    base: '#0A84FF',
    light: '#0A84FF',
    lightInk: '#161716',
    dark: '#0A84FF',
    darkInk: '#161716',
  },
  indigo: {
    base: '#5E5CE6',
    light: '#5E5CE6',
    lightInk: '#FFFFFF',
    dark: '#5E5CE6',
    darkInk: '#FFFFFF',
  },
  violet: {
    base: '#BF5AF2',
    light: '#BF5AF2',
    lightInk: '#161716',
    dark: '#BF5AF2',
    darkInk: '#161716',
  },
  pink: {
    base: '#FF375F',
    light: '#FF375F',
    lightInk: '#161716',
    dark: '#FF375F',
    darkInk: '#161716',
  },
  red: {
    base: '#FF453A',
    light: '#FF453A',
    lightInk: '#161716',
    dark: '#FF453A',
    darkInk: '#161716',
  },
  orange: {
    base: '#FF9F0A',
    light: '#CA7D0B',
    lightInk: '#161716',
    dark: '#FF9F0A',
    darkInk: '#161716',
  },
  amber: {
    base: '#FFD60A',
    light: '#A78C0F',
    lightInk: '#161716',
    dark: '#FFD60A',
    darkInk: '#161716',
  },
  green: {
    base: '#30D158',
    light: '#07A43C',
    lightInk: '#161716',
    dark: '#30D158',
    darkInk: '#161716',
  },
  teal: {
    base: '#40C8E0',
    light: '#139CB1',
    lightInk: '#161716',
    dark: '#40C8E0',
    darkInk: '#161716',
  },
  graphite: {
    base: '#1C1C1E',
    light: '#1C1C1E',
    lightInk: '#FFFFFF',
    dark: '#6F6F71',
    darkInk: '#FFFFFF',
  },
};

// ── State ────────────────────────────────────────────────────────────────

export type Phase = 'waiting' | 'voting' | 'revealed';
export type Role = 'voter' | 'viewer';
export type Connection = 'live' | 'reconnecting' | 'offline';

export interface Person {
  id: string;
  name: string;
  color: AvatarKey;
  role: Role;
  online: boolean;
  /** false while a client is (re)connecting and has not finished its first sync (UX-001 gate). */
  synced: boolean;
  /** Stepped out to Home with the session kept alive (O3 soft step-out). */
  steppedOut: boolean;
  leftAt?: number | undefined;
  removedBy?: string | undefined;
  joinedAt: number;
  /** Simulated peers vote on their own; `lean` biases their pick (index offset from the target). */
  lean: number;
  device: 'web' | 'cli';
}

export interface Story {
  id: string;
  key: string; // e.g. PROJ-101 ('' if none)
  title: string;
  status: 'queued' | 'done' | 'skipped';
  value?: string | undefined; // the agreed estimate (UX-033)
  doneAt?: number | undefined;
}

export interface Round {
  id: string;
  storyId: string | null;
  title: string;
  scaleId: string;
  startedAt: number;
  revealedAt?: number | undefined;
  closedAt?: number | undefined;
  discardedAt?: number | undefined;
  /** personId → card face or PASS */
  votes: Record<string, string>;
  /** set when this round is a re-vote of an earlier one (UX-038) */
  revoteOf?: string | undefined;
  acceptedValue?: string | undefined;
  /** Host-picked override before Accept (awareness-only in the real design). */
  hostPick?: string | undefined;
  /** People counted for this round (O14 decides how late joiners join this set). */
  eligibleAtStart: string[];
}

export interface Notice {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warning' | 'danger';
  /** Undo beats confirm (principle 6): the action commits when the toast expires. */
  undoLabel?: string | undefined;
  expiresAt: number;
}

export interface LabEvent {
  at: number;
  text: string;
  /** Which register entry this event demonstrates, e.g. 'UX-001'. */
  ux?: string | undefined;
}

export interface Decisions {
  /** O4: Accept and Next in one tap, or two. */
  acceptNext: 'one' | 'two';
  /** O11: settle window before auto-reveal, ms (0 = none). */
  settleMs: number;
  /** O13: consensus rule. */
  rule: 'step-distance' | 'today';
  /** O14: late joiners count once they vote, or as soon as they are online. */
  lateJoiners: 'once-they-vote' | 'everyone-online';
  /** O3: Back = soft step-out (session kept), or Back = Leave. */
  back: 'step-out' | 'leave';
  /** O1: keep password rooms. */
  passwordRooms: boolean;
  /** O18: session end sends everyone Home (ADR-0023) or renders "ended" in place. */
  sessionEnd: 'home' | 'in-place';
}

export const DEFAULT_DECISIONS: Decisions = {
  acceptNext: 'one',
  settleMs: 500,
  rule: 'step-distance',
  lateJoiners: 'once-they-vote',
  back: 'step-out',
  passwordRooms: true,
  sessionEnd: 'home',
};

export interface RoomState {
  code: string; // 'K7P-9MR'
  name: string; // 'Sprint 42'
  hostId: string;
  selfId: string;
  scaleId: string;
  password: boolean;
  people: Person[];
  stories: Story[];
  rounds: Round[];
  connection: Connection;
  ended: boolean;
  endedAt?: number | undefined;
  createdAt: number;
  /** settle window deadline, if every counted voter is in */
  settleUntil?: number | undefined;
  notices: Notice[];
  lab: LabEvent[];
  decisions: Decisions;
  peersAutoVote: boolean;
  /** pending commits (undo window) */
  pending: { id: number; label: string; commitAt: number; commit: () => void; undo: () => void }[];
}

// ── Outcome (§6.1 outcome table, D20 / O13) ─────────────────────────────────

export type OutcomeKind = 'agreed' | 'close' | 'split' | 'one' | 'none';

export interface Outcome {
  kind: OutcomeKind;
  n: number; // non-pass votes
  passes: string[]; // person ids who passed
  didntVote: string[]; // eligible, online-at-reveal, no vote (UX-008)
  suggestion?: string | undefined; // undefined for split / none
  min?: string | undefined;
  max?: string | undefined;
  avg?: number | undefined; // numeric scales only
  low?: { value: string | undefined; names: string[] } | undefined; // only the side that differs from the suggestion
  high?: { value: string | undefined; names: string[] } | undefined;
  /** columns over the full scale, then Pass apart */
  columns: { face: string; ids: string[]; mode: boolean }[];
  glyph: string; // ✓ ≈ ↔ – or ''
  word: string; // Agreed / Close / Split / No votes / ''
  /** shared status line (same words on web and CLI) */
  statusLine: string;
}

function namesOf(ids: string[], people: Person[], selfId: string): string[] {
  return ids.map((id) => (id === selfId ? 'you' : (people.find((p) => p.id === id)?.name ?? '?')));
}

export function computeOutcome(
  round: Round,
  scale: ProtoScale,
  people: Person[],
  selfId: string,
  rule: Decisions['rule'],
): Outcome {
  const entries = Object.entries(round.votes);
  const passes = entries.filter(([, v]) => v === PASS).map(([id]) => id);
  const real = entries.filter(([, v]) => v !== PASS);
  const n = real.length;
  const eligible = round.eligibleAtStart.filter((id) =>
    people.find((p) => p.id === id && p.role === 'voter' && !p.leftAt),
  );
  const didntVote = eligible.filter((id) => !(id in round.votes));
  const columns = scale.cards.map((face) => ({
    face,
    ids: real.filter(([, v]) => v === face).map(([id]) => id),
    mode: false,
  }));
  const idx = (v: string) => scale.cards.indexOf(v);

  if (n === 0) {
    return {
      kind: 'none',
      n,
      passes,
      didntVote,
      columns,
      glyph: '–',
      word: 'No votes',
      statusLine: '– No votes',
    };
  }

  const counts = new Map<string, number>();
  for (const [, v] of real) counts.set(v, (counts.get(v) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  const modes = [...counts.entries()].filter(([, c]) => c === maxCount).map(([v]) => v);
  const indices = real.map(([, v]) => idx(v));
  const offScale = indices.some((i) => i < 0);
  const minI = Math.min(...indices.filter((i) => i >= 0));
  const maxI = Math.max(...indices.filter((i) => i >= 0));
  const min = scale.cards[minI] ?? '?';
  const max = scale.cards[maxI] ?? '?';
  const avg = scale.numeric ? real.reduce((s, [, v]) => s + Number(v), 0) / n : undefined;
  const d = maxI - minI;
  const m = maxCount / n;

  let suggestion: string;
  if (modes.length === 1) suggestion = modes[0]!;
  else if (scale.numeric && avg !== undefined) {
    suggestion = modes.toSorted(
      (a, b) => Math.abs(Number(a) - avg) - Math.abs(Number(b) - avg) || Number(b) - Number(a),
    )[0]!;
  } else suggestion = modes.toSorted((a, b) => idx(b) - idx(a))[0]!;

  for (const c of columns) c.mode = c.face === suggestion;

  let kind: OutcomeKind;
  if (n === 1) kind = 'one';
  else if (counts.size === 1 && !offScale) kind = 'agreed';
  else if (offScale) kind = 'split';
  else if (rule === 'today')
    kind = d <= 1 ? 'close' : 'split'; // today's rule, roughly: adjacent = close
  else if (d <= 1 || (scale.numeric && d === 2 && m >= 0.6 && n >= 4)) kind = 'close';
  else kind = 'split';

  const avgText = avg !== undefined ? ` · avg ${Math.round(avg * 10) / 10}` : '';
  const sideNames = (face: string) =>
    namesOf(columns.find((c) => c.face === face)?.ids ?? [], people, selfId);

  if (kind === 'split') {
    const lo = sideNames(min)[0] ?? '?';
    const hi = sideNames(max)[0] ?? '?';
    return {
      kind,
      n,
      passes,
      didntVote,
      columns,
      min,
      max,
      avg,
      glyph: '↔',
      word: 'Split',
      statusLine: `↔ Split · ${lo} (${min}) and ${hi} (${max}) — hear them out`,
    };
  }

  const low = min !== suggestion ? { value: min, names: sideNames(min) } : undefined;
  const high = max !== suggestion ? { value: max, names: sideNames(max) } : undefined;

  if (kind === 'agreed') {
    return {
      kind,
      n,
      passes,
      didntVote,
      columns,
      suggestion,
      min,
      max,
      avg,
      glyph: '✓',
      word: 'Agreed',
      statusLine: `✓ Agreed · everyone said ${suggestion}`,
    };
  }
  if (kind === 'one') {
    return {
      kind,
      n,
      passes,
      didntVote,
      columns,
      suggestion,
      min,
      max,
      avg,
      glyph: '',
      word: '',
      statusLine: '1 vote',
    };
  }
  return {
    kind,
    n,
    passes,
    didntVote,
    columns,
    suggestion,
    min,
    max,
    avg,
    low,
    high,
    glyph: '≈',
    word: 'Close',
    statusLine: `≈ Close · range ${min}–${max}${avgText}`,
  };
}

// ── Fixtures (§6 canonical fixture) ─────────────────────────────────────────

const T0 = Date.now();

export function canonicalPeople(): Person[] {
  const p = (
    id: string,
    name: string,
    color: AvatarKey,
    lean: number,
    extra: Partial<Person> = {},
  ): Person => ({
    id,
    name,
    color,
    role: 'voter',
    online: true,
    synced: true,
    steppedOut: false,
    joinedAt: T0,
    lean,
    device: 'web',
    ...extra,
  });
  return [
    p('hana', 'Hana', 'racing-green', 0),
    p('ana', 'Ana', 'blue', -1),
    p('sam', 'Sam', 'orange', 0),
    p('bob', 'Bob', 'violet', 0, { device: 'cli' }),
    p('dev', 'Dev', 'teal', 1),
    p('eve', 'Eve', 'pink', 0, { role: 'viewer' }),
  ];
}

export function canonicalStories(): Story[] {
  const s = (key: string, title: string): Story => ({ id: key, key, title, status: 'queued' });
  return [
    s('PROJ-101', 'Login form validation'),
    s('PROJ-102', 'Password reset'),
    s('PROJ-103', 'Export CSV'),
    s('PROJ-104', 'Rate-limit the public API'),
    s('PROJ-105', 'Dark mode for the settings page'),
  ];
}

export type FixtureName =
  | 'host-alone' // waiting, nobody else here, queue present
  | 'waiting' // waiting, people here, queue present
  | 'waiting-empty-queue'
  | 'voting-fresh'
  | 'voting-partial' // Ana, Dev, you voted; Sam, Bob waiting
  | 'voting-all-in' // everyone in, settle window running
  | 'revealed-close'
  | 'revealed-split'
  | 'revealed-agreed'
  | 'revealed-one'
  | 'revealed-none'
  | 'revote' // re-vote of the split round, previous tally shown hollow
  | 'queue-done' // all stories estimated
  | 'ended';

// ── The model ────────────────────────────────────────────────────────────

let nextId = 1;
const uid = (p: string) => `${p}-${nextId++}`;

export class RoomModel {
  state: RoomState;
  private listeners = new Set<() => void>();
  /** simulated per-peer vote timers for the current round */
  private peerPlan = new Map<string, number>();

  constructor(fixture: FixtureName = 'waiting', selfId = 'hana') {
    this.state = this.blank(selfId);
    this.load(fixture, selfId);
  }

  // ── plumbing ──
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
  private log(text: string, ux?: string) {
    this.state.lab = [{ at: Date.now(), text, ux }, ...this.state.lab].slice(0, 40);
  }
  notify(text: string, kind: Notice['kind'] = 'info', undoLabel?: string) {
    // one toast at a time (hn-toast): a new one replaces the old
    this.state.notices = [{ id: nextId++, text, kind, undoLabel, expiresAt: Date.now() + 5000 }];
  }
  dismissNotice() {
    this.state.notices = [];
    this.emit();
  }

  private blank(selfId: string): RoomState {
    return {
      code: 'K7P-9MR',
      name: 'Sprint 42',
      hostId: 'hana',
      selfId,
      scaleId: 'fibonacci',
      password: false,
      people: canonicalPeople(),
      stories: canonicalStories(),
      rounds: [],
      connection: 'live',
      ended: false,
      createdAt: T0 - 18 * 60_000,
      notices: [],
      lab: [],
      decisions: { ...DEFAULT_DECISIONS },
      peersAutoVote: true,
      pending: [],
    };
  }

  /** Reset to a named fixture. Keeps decisions and the viewer perspective. */
  load(fixture: FixtureName, selfId = this.state.selfId) {
    const decisions = this.state.decisions;
    const auto = this.state.peersAutoVote;
    this.state = this.blank(selfId);
    this.state.decisions = decisions;
    this.state.peersAutoVote = auto;
    this.peerPlan.clear();
    const now = Date.now();
    const s = this.state;
    const mkRound = (
      storyIdx: number,
      votes: Record<string, string>,
      revealed: boolean,
      extra: Partial<Round> = {},
    ): Round => {
      const st = s.stories[storyIdx]!;
      return {
        id: uid('r'),
        storyId: st.id,
        title: st.title,
        scaleId: s.scaleId,
        startedAt: now - 72_000,
        revealedAt: revealed ? now - 2000 : undefined,
        votes,
        eligibleAtStart: this.countedVoterIds(),
        ...extra,
      };
    };
    const markDone = (i: number, v: string) =>
      Object.assign(s.stories[i]!, { status: 'done', value: v, doneAt: now - (5 - i) * 60_000 });
    // history so the rail / summary has something: PROJ-100 is not in the queue, it is a finished earlier story
    s.stories.unshift({
      id: 'PROJ-100',
      key: 'PROJ-100',
      title: 'Search',
      status: 'done',
      value: '5',
      doneAt: now - 9 * 60_000,
    });
    s.rounds.push({
      id: uid('r'),
      storyId: 'PROJ-100',
      title: 'Search',
      scaleId: 'fibonacci',
      startedAt: now - 10 * 60_000,
      revealedAt: now - 9.2 * 60_000,
      closedAt: now - 9 * 60_000,
      acceptedValue: '5',
      votes: { hana: '5', ana: '5', sam: '5', bob: '5', dev: '5' },
      eligibleAtStart: ['hana', 'ana', 'sam', 'bob', 'dev'],
    });
    // a discarded round that must never show in history (UX-004)
    s.rounds.push({
      id: uid('r'),
      storyId: 'PROJ-100',
      title: 'Search',
      scaleId: 'fibonacci',
      startedAt: now - 11 * 60_000,
      discardedAt: now - 10.5 * 60_000,
      votes: { hana: '3' },
      eligibleAtStart: ['hana'],
    });
    const story = 1; // index of PROJ-101 after unshift
    switch (fixture) {
      case 'host-alone':
        s.people = s.people.filter((p) => p.id === selfId || p.id === 'hana');
        s.rounds = [];
        s.stories = s.stories.filter((x) => x.status === 'queued');
        break;
      case 'waiting':
        break;
      case 'waiting-empty-queue':
        s.stories = s.stories.filter((x) => x.status !== 'queued');
        break;
      case 'voting-fresh':
        s.rounds.push(mkRound(story, {}, false, { startedAt: now }));
        this.planPeers();
        break;
      case 'voting-partial':
        s.rounds.push(
          mkRound(story, { ana: '5', dev: '13', hana: '8' }, false, { startedAt: now - 42_000 }),
        );
        break;
      case 'voting-all-in':
        s.rounds.push(
          mkRound(story, { ana: '5', dev: '13', hana: '8', sam: '8', bob: '8' }, false, {
            startedAt: now - 70_000,
          }),
        );
        s.settleUntil = now + Math.max(s.decisions.settleMs, 1500);
        break;
      case 'revealed-close':
        s.rounds.push(mkRound(story, { ana: '5', sam: '8', bob: '8', hana: '8', dev: '13' }, true));
        break;
      case 'revealed-split':
        s.rounds.push(mkRound(story, { ana: '3', sam: '8', bob: '8', hana: '8', dev: '21' }, true));
        break;
      case 'revealed-agreed':
        s.rounds.push(mkRound(story, { ana: '8', sam: '8', bob: '8', hana: '8', dev: '8' }, true));
        break;
      case 'revealed-one':
        s.rounds.push(mkRound(story, { hana: '5', ana: PASS, sam: PASS }, true));
        break;
      case 'revealed-none':
        s.rounds.push(mkRound(story, { ana: PASS, hana: PASS }, true));
        break;
      case 'revote': {
        const prev = mkRound(story, { ana: '3', sam: '8', bob: '8', hana: '8', dev: '21' }, true, {
          closedAt: now - 30_000,
        });
        s.rounds.push(prev);
        s.rounds.push(
          mkRound(story, { ana: '5', sam: '8' }, false, {
            revoteOf: prev.id,
            startedAt: now - 20_000,
          }),
        );
        break;
      }
      case 'queue-done':
        ['8', '3', '5', '13', '2'].forEach((v, i) => markDone(i + 1, v));
        break;
      case 'ended':
        ['8', '3', '5'].forEach((v, i) => markDone(i + 1, v));
        s.ended = true;
        s.endedAt = now;
        break;
    }
    this.log(`Loaded fixture "${fixture}" as ${this.nameOf(selfId)}`);
    this.emit();
  }

  // ── derived ──
  get self(): Person | undefined {
    return this.state.people.find((p) => p.id === this.state.selfId);
  }
  get isHost(): boolean {
    return this.state.hostId === this.state.selfId;
  }
  get host(): Person | undefined {
    return this.state.people.find((p) => p.id === this.state.hostId);
  }
  get scale(): ProtoScale {
    return SCALES[this.activeRound?.scaleId ?? this.state.scaleId] ?? SCALES['fibonacci']!;
  }
  /** Present people (not left, not removed). */
  get present(): Person[] {
    return this.state.people.filter((p) => !p.leftAt);
  }
  /** Rounds that still count: never discarded (UX-004). */
  get liveRounds(): Round[] {
    return this.state.rounds.filter((r) => !r.discardedAt);
  }
  /** The phase reads only the last round in array order (D19). */
  get lastRound(): Round | undefined {
    const rs = this.liveRounds;
    return rs[rs.length - 1];
  }
  get phase(): Phase {
    const r = this.lastRound;
    if (!r || r.closedAt) return 'waiting';
    if (r.revealedAt) return 'revealed';
    return 'voting';
  }
  get activeRound(): Round | undefined {
    return this.phase === 'waiting' ? undefined : this.lastRound;
  }
  /** Rounds shown in history: revealed, not discarded, not superseded by a re-vote. */
  get history(): Round[] {
    return this.liveRounds.filter((r) => r.revealedAt);
  }
  get queue(): Story[] {
    const activeStory = this.activeRound?.storyId;
    return this.state.stories.filter((s) => s.status === 'queued' && s.id !== activeStory);
  }
  get done(): Story[] {
    return this.state.stories.filter((s) => s.status === 'done');
  }
  get skipped(): Story[] {
    return this.state.stories.filter((s) => s.status === 'skipped');
  }
  get currentStory(): Story | undefined {
    const r = this.activeRound;
    return r?.storyId ? this.state.stories.find((s) => s.id === r.storyId) : undefined;
  }
  get nextStory(): Story | undefined {
    return this.queue[0];
  }
  /** "Story 3 of 12": one numbering format everywhere (UX-077). */
  storyPosition(storyId: string | null | undefined): { n: number; of: number } {
    const all = this.state.stories.filter((s) => s.status !== 'skipped');
    const i = all.findIndex((s) => s.id === storyId);
    return { n: i >= 0 ? i + 1 : all.length + 1, of: all.length };
  }
  /** Voters who count for the current round (UX-008, O14). */
  countedVoterIds(round = this.activeRound): string[] {
    const voters = this.present.filter((p) => p.role === 'voter' && p.online);
    if (!round) return voters.map((p) => p.id);
    if (this.state.decisions.lateJoiners === 'everyone-online') return voters.map((p) => p.id);
    return voters
      .filter((p) => round.eligibleAtStart.includes(p.id) || p.id in round.votes)
      .map((p) => p.id);
  }
  get votedCount(): { voted: number; of: number } {
    const r = this.activeRound;
    const ids = this.countedVoterIds();
    return { voted: r ? ids.filter((id) => id in r.votes).length : 0, of: ids.length };
  }
  get waitingOn(): Person[] {
    const r = this.activeRound;
    if (!r) return [];
    return this.countedVoterIds()
      .filter((id) => !(id in r.votes))
      .map((id) => this.person(id)!);
  }
  get outcome(): Outcome | undefined {
    const r = this.activeRound;
    if (!r || !r.revealedAt) return undefined;
    return computeOutcome(
      r,
      SCALES[r.scaleId] ?? SCALES['fibonacci']!,
      this.state.people,
      this.state.selfId,
      this.state.decisions.rule,
    );
  }
  /** The previous tally when this round is a re-vote (UX-038). */
  get previousOfRevote(): { round: Round; outcome: Outcome } | undefined {
    const r = this.activeRound;
    const prev = r?.revoteOf ? this.state.rounds.find((x) => x.id === r.revoteOf) : undefined;
    if (!prev) return undefined;
    return {
      round: prev,
      outcome: computeOutcome(
        prev,
        SCALES[prev.scaleId] ?? SCALES['fibonacci']!,
        this.state.people,
        this.state.selfId,
        this.state.decisions.rule,
      ),
    };
  }
  /** The value Accept would write: the host's pick, else the suggestion. */
  get acceptValue(): string | undefined {
    const r = this.activeRound;
    return r?.hostPick ?? this.outcome?.suggestion;
  }
  /** The host's one primary button, per phase and outcome (§2.1, §6.1). Never moves. */
  get primary(): {
    label: string;
    enabled: boolean;
    action: 'start' | 'reveal' | 'accept' | 'revote' | 'none';
    hint?: string;
  } {
    const s = this.state;
    if (s.connection !== 'live') return { label: 'Reconnecting…', enabled: false, action: 'none' };
    const ph = this.phase;
    if (ph === 'waiting') {
      const next = this.nextStory;
      return {
        label: next ? `Start · ${next.key || next.title}` : 'Start a story',
        enabled: true,
        action: 'start',
      };
    }
    if (ph === 'voting') {
      const { voted, of } = this.votedCount;
      if (voted === 0)
        return { label: `Waiting for votes · 0/${of}`, enabled: false, action: 'reveal' };
      return { label: `Reveal · ${voted}/${of}`, enabled: true, action: 'reveal' };
    }
    const o = this.outcome!;
    const v = this.acceptValue;
    const next = this.nextStory;
    if (!v || (o.kind === 'split' && !this.activeRound?.hostPick))
      return { label: 'Re-vote', enabled: true, action: 'revote' };
    const nextPart =
      next && s.decisions.acceptNext === 'one' ? ` · Next: ${next.key || next.title}` : '';
    return { label: `Accept ${v}${nextPart}`, enabled: true, action: 'accept' };
  }
  person(id: string): Person | undefined {
    return this.state.people.find((p) => p.id === id);
  }
  nameOf(id: string): string {
    return this.person(id)?.name ?? id;
  }
  /** The shared status line for the viewer (§2.1 table; copy shared with the CLI). */
  get statusLine(): string {
    const ph = this.phase;
    const me = this.self;
    const host = this.host?.name ?? 'the host';
    if (this.state.connection === 'reconnecting') return 'Reconnecting… your vote is kept';
    if (this.state.connection === 'offline') return 'Offline · votes will sync when you are back';
    if (ph === 'waiting') {
      if (this.isHost)
        return this.present.length <= 1
          ? 'Invite your team'
          : this.nextStory
            ? `Up next · ${this.nextStory.title}`
            : 'Add a story or just start';
      return `Waiting for ${host} to start…`;
    }
    if (ph === 'voting') {
      if (this.state.settleUntil) return "Everyone's in…";
      const r = this.activeRound!;
      if (me?.role === 'viewer') return "You're watching";
      const mine = r.votes[this.state.selfId];
      const waiting = this.waitingOn.filter((p) => p.id !== this.state.selfId).map((p) => p.name);
      const wait = waiting.length ? ` · waiting on ${waiting.join(', ')}` : '';
      if (!mine) return "Pick a card · votes stay hidden until everyone's in";
      return `${mine === PASS ? 'You passed' : `You voted ${mine}`}${wait}`;
    }
    const o = this.outcome!;
    const r = this.activeRound!;
    if (!this.isHost && r.hostPick && r.hostPick !== o.suggestion)
      return `${host} picked ${r.hostPick}`;
    return this.isHost ? o.statusLine : `${o.statusLine} · waiting for ${host}`;
  }

  // ── actions: round lifecycle ──
  start(storyId?: string, by = this.state.selfId) {
    const s = this.state;
    if (by !== s.hostId) return this.refuse('Only the host can start a story');
    if (this.phase === 'voting') {
      // UX-003: refuse startRound while a round is still voting
      this.log(`${this.nameOf(by)} tried to start while a round is voting: refused`, 'UX-003');
      return this.refuse('A story is already being voted on');
    }
    if (this.phase === 'revealed') this.closeActive();
    const story = storyId ? s.stories.find((x) => x.id === storyId) : this.nextStory;
    const round: Round = {
      id: uid('r'),
      storyId: story?.id ?? null,
      title: story?.title ?? 'Untitled story',
      scaleId: s.scaleId,
      startedAt: Date.now(),
      votes: {},
      eligibleAtStart: this.countedVoterIds(undefined),
    };
    s.rounds.push(round);
    s.settleUntil = undefined;
    this.planPeers();
    this.log(
      `${this.nameOf(by)} started ${story?.key ?? 'a story'} — same screen for everyone, no route change`,
      'UX-017',
    );
    this.emit();
  }

  vote(face: string, by = this.state.selfId) {
    const r = this.activeRound;
    if (!r || this.phase !== 'voting') return;
    const p = this.person(by);
    if (!p || p.role !== 'voter') return;
    // UX-023: tapping the selected card again does NOT clear the vote
    if (r.votes[by] === face) return;
    r.votes[by] = face;
    if (!r.eligibleAtStart.includes(by)) r.eligibleAtStart.push(by); // late joiner counted once they vote (O14)
    if (this.state.settleUntil)
      this.log(
        `${this.nameOf(by)} changed their vote during the settle window: window restarted`,
        'UX-014',
      );
    this.checkAllIn();
    this.emit();
  }

  /** Explicit clear, with an Undo toast (UX-023: never silent). */
  clearVote(by = this.state.selfId) {
    const r = this.activeRound;
    if (!r || !(by in r.votes)) return;
    const prev = r.votes[by];
    delete r.votes[by];
    this.state.settleUntil = undefined;
    this.pendingAction(
      'Vote cleared',
      () => {},
      () => {
        if (prev !== undefined) r.votes[by] = prev;
      },
    );
    this.emit();
  }

  reveal(by = this.state.selfId, reason: 'host' | 'auto' = 'host') {
    const r = this.activeRound;
    if (!r || r.revealedAt) return;
    if (reason === 'host' && by !== this.state.hostId)
      return this.refuse('Only the host can reveal');
    r.revealedAt = Date.now();
    this.state.settleUntil = undefined;
    const o = this.outcome!;
    if (o.kind === 'agreed')
      this.log("Agreed with ≥2 votes: hnch'd stamp + burst, never blocks the primary", 'UX-037');
    this.log(
      reason === 'auto'
        ? 'Auto-reveal after the settle window (every counted voter in, all synced)'
        : `${this.nameOf(by)} revealed`,
      reason === 'auto' ? 'UX-001' : undefined,
    );
    this.emit();
  }

  /** Host picks a value other than the suggestion (tap a Strip column / hero chip). */
  pick(value: string) {
    const r = this.activeRound;
    if (!r || !r.revealedAt || !this.isHost) return;
    r.hostPick = value === this.outcome?.suggestion ? undefined : value;
    this.emit();
  }

  /** Accept the value (UX-033). O4 'one' starts the next story in the same tap. */
  accept(value = this.acceptValue) {
    const r = this.activeRound;
    if (!r || !r.revealedAt || !value || !this.isHost) return;
    r.acceptedValue = value;
    r.closedAt = Date.now();
    const story = r.storyId ? this.state.stories.find((s) => s.id === r.storyId) : undefined;
    if (story) Object.assign(story, { status: 'done', value, doneAt: Date.now() });
    this.log(
      `Accepted ${value} for ${story?.key ?? 'the story'}: the only new data, written by the tap that advances`,
      'UX-033',
    );
    this.notify(`${story?.key ?? 'Story'} → ${value}`, 'success');
    if (this.state.decisions.acceptNext === 'one' && this.nextStory) this.start(this.nextStory.id);
    else this.emit();
  }

  revote() {
    const r = this.activeRound;
    if (!r || !this.isHost) return;
    r.closedAt = Date.now();
    const round: Round = {
      id: uid('r'),
      storyId: r.storyId,
      title: r.title,
      scaleId: r.scaleId,
      startedAt: Date.now(),
      votes: {},
      revoteOf: r.id,
      eligibleAtStart: this.countedVoterIds(undefined),
    };
    this.state.rounds.push(round);
    this.planPeers(true);
    this.log('Re-vote: the previous tally stays visible as hollow dots', 'UX-038');
    this.emit();
  }

  /** Skip story: undo, not confirm (UX-005). Commits after 5 s. */
  skip(storyId = this.currentStory?.id ?? this.nextStory?.id) {
    const story = this.state.stories.find((s) => s.id === storyId);
    if (!story || !this.isHost) return;
    const r = this.activeRound;
    const wasActive = r?.storyId === story.id;
    const snapshot = r ? { ...r, votes: { ...r.votes } } : undefined;
    story.status = 'skipped';
    if (wasActive && r) r.discardedAt = Date.now();
    this.pendingAction(
      `Skipped ${story.key || story.title}`,
      () => {},
      () => {
        story.status = 'queued';
        if (wasActive && r && snapshot) {
          r.discardedAt = undefined;
          r.votes = snapshot.votes;
        }
      },
    );
    this.log(
      `Skip story with a 5 s Undo instead of a confirm; one verb ("Skip story") everywhere`,
      'UX-005',
    );
    this.emit();
  }

  // ── actions: stories ──
  /** Paste many lines → many stories (UX-021). Returns the parsed preview. */
  static parseStories(text: string): { key: string; title: string }[] {
    return text
      .split(/\r?\n/u)
      .map((l) => l.trim().replace(/^[-*•\d.)\s]+/u, ''))
      .filter(Boolean)
      .map((l) => {
        const m = /^([A-Z][A-Z0-9]+-\d+)[\s:–-]+(.+)$/u.exec(l);
        return m ? { key: m[1] ?? '', title: m[2] ?? l } : { key: '', title: l };
      });
  }
  addStories(text: string) {
    const parsed = RoomModel.parseStories(text);
    if (!parsed.length) return;
    const added: Story[] = parsed.map((p) => ({
      id: uid('s'),
      key: p.key,
      title: p.title,
      status: 'queued',
    }));
    this.state.stories.push(...added);
    this.pendingAction(
      `Added ${added.length} ${added.length === 1 ? 'story' : 'stories'}`,
      () => {},
      () => {
        this.state.stories = this.state.stories.filter((s) => !added.includes(s));
      },
      'Undo paste',
    );
    this.emit();
  }
  removeStory(id: string) {
    const i = this.state.stories.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [st] = this.state.stories.splice(i, 1);
    if (!st) return;
    this.pendingAction(
      `Removed ${st.key || st.title}`,
      () => {},
      () => this.state.stories.splice(i, 0, st),
    );
    this.emit();
  }
  doNext(id: string) {
    const st = this.state.stories.find((s) => s.id === id);
    if (!st) return;
    this.state.stories = [st, ...this.state.stories.filter((s) => s !== st)];
    this.emit();
  }
  bringBack(id: string) {
    const st = this.state.stories.find((s) => s.id === id);
    if (st) st.status = 'queued';
    this.emit();
  }
  changeValue(id: string, value: string) {
    const st = this.state.stories.find((s) => s.id === id);
    if (st) st.value = value;
    this.emit();
  }
  editTitle(id: string, title: string) {
    const st = this.state.stories.find((s) => s.id === id);
    if (st) st.title = title;
    const r = this.activeRound;
    if (r && r.storyId === id) r.title = title;
    this.emit();
  }
  setScale(scaleId: string) {
    if (!this.isHost) return this.refuse('Only the host can change the scale'); // UX-006
    if (this.phase === 'voting') return this.refuse('Change the scale between stories');
    this.state.scaleId = scaleId;
    this.log(
      `Scale → ${SCALES[scaleId]?.label ?? scaleId}; peers see the custom name too`,
      'UX-081',
    );
    this.emit();
  }
  setPassword(on: boolean) {
    if (!this.isHost) return this.refuse('Only the host can change access'); // UX-006
    this.state.password = on;
    this.log(
      `Password ${on ? 'on' : 'off'}: access state is what the relay reports, not local state`,
      'UX-013',
    );
    this.emit();
  }
  rename(name: string) {
    this.state.name = name;
    this.emit();
  }

  // ── actions: people ──
  setRole(role: Role, id = this.state.selfId) {
    const p = this.person(id);
    if (!p) return;
    p.role = role;
    if (role === 'viewer' && this.activeRound) delete this.activeRound.votes[id];
    this.checkAllIn();
    this.emit();
  }
  renameSelf(name: string) {
    const p = this.self;
    if (p) p.name = name;
    this.emit();
  }
  makeHost(id: string) {
    if (!this.isHost) return;
    const prev = this.nameOf(this.state.hostId);
    this.state.hostId = id;
    // UX-078: a deliberate hand-off is announced as one, not as "disconnected"
    this.notify(`${prev} made ${this.nameOf(id)} the host`);
    this.log(
      `Hand-off announced as a hand-off ("${prev} made ${this.nameOf(id)} the host")`,
      'UX-078',
    );
    this.emit();
  }
  /** Remove person: confirm in the UI (affects others), then this. */
  removePerson(id: string) {
    const p = this.person(id);
    if (!p || !this.isHost) return;
    p.leftAt = Date.now();
    p.removedBy = this.state.selfId;
    if (this.activeRound) delete this.activeRound.votes[id];
    this.notify(`Removed ${p.name}`);
    this.checkAllIn();
    this.emit();
  }
  /** Leave: writes leftAt, keeps the room in Recent. Host with others online hands off first (UX-032). */
  leave(handTo?: string) {
    const me = this.self;
    if (!me) return;
    if (this.isHost) {
      const to = handTo ?? this.present.find((p) => p.id !== me.id && p.online && p.synced)?.id;
      if (to) {
        this.state.hostId = to;
        this.log(`${me.name} left and made ${this.nameOf(to)} host`, 'UX-032');
      }
    }
    me.leftAt = Date.now();
    this.emit();
  }
  stepOut() {
    const me = this.self;
    if (me) me.steppedOut = true;
    this.log('Back = step out: the session stays alive, nobody else is affected', 'UX-002');
    this.emit();
  }
  returnToRoom() {
    const me = this.self;
    if (me) me.steppedOut = false;
    this.emit();
  }
  endForEveryone() {
    if (!this.isHost) return;
    if (this.activeRound && !this.activeRound.revealedAt) this.activeRound.discardedAt = Date.now();
    this.state.ended = true;
    this.state.endedAt = Date.now();
    this.log(
      'Session ended: everyone goes Home where the summary card renders (ADR-0023)',
      'UX-040',
    );
    this.emit();
  }
  /** Change who you are looking as (host / voter / viewer / new joiner). Same room. */
  viewAs(id: string) {
    if (id === 'kai' && !this.person('kai')) {
      this.state.people.push({
        id: 'kai',
        name: 'Kai',
        color: 'amber',
        role: 'voter',
        online: true,
        synced: true,
        steppedOut: false,
        joinedAt: Date.now(),
        lean: 0,
        device: 'web',
      });
      this.log('Kai joined late: counted once they vote (O14)', 'UX-008');
    }
    this.state.selfId = id;
    this.emit();
  }

  // ── trust lab: simulations of the critical/high trust bugs ──
  /** UX-001: a voted participant reloads. Their client must not reveal until synced. */
  simulateReload(id: string) {
    const p = this.person(id);
    if (!p) return;
    p.synced = false;
    p.online = true;
    this.log(
      `${p.name} reloads: their client is not synced yet, so it cannot auto-reveal (today it reveals for everyone)`,
      'UX-001',
    );
    setTimeout(() => {
      p.synced = true;
      this.log(
        `${p.name} synced again; their vote is still there and the round is still hidden`,
        'UX-001',
      );
      this.checkAllIn();
      this.emit();
    }, 1800);
    this.emit();
  }
  /** UX-007/UX-056-ish: the host goes offline; election only picks online, synced peers. */
  simulateHostOffline() {
    const host = this.host;
    if (!host) return;
    host.online = false;
    this.log(`${host.name} (host) dropped`);
    setTimeout(() => {
      const next = this.present.find(
        (p) => p.id !== host.id && p.online && p.synced && p.role === 'voter',
      );
      if (next) {
        this.state.hostId = next.id;
        this.notify(`${host.name} dropped. ${next.name} is host now`, 'warning');
        this.log(
          `Election picked ${next.name} (online and synced). An offline voter never elects itself`,
          'UX-078',
        );
      }
      this.emit();
    }, 1200);
    this.emit();
  }
  /** "You" lose the connection: the primary becomes "Reconnecting…", and you never elect yourself host. */
  simulateSelfOffline() {
    this.state.connection = 'reconnecting';
    const me = this.self;
    if (me) me.synced = false;
    this.log(
      'You lost the connection: header dot turns ◌, the primary shows "Reconnecting…", your vote is kept, no self-election',
      'UX-061',
    );
    setTimeout(() => {
      this.state.connection = 'live';
      if (me) me.synced = true;
      this.log('Reconnected; one quiet toast, no banner stack', 'UX-061');
      this.notify('Back online');
      this.emit();
    }, 2500);
    this.emit();
  }
  /** UX-003: a second host tab (or a stale peer) tries to start a round mid-vote. */
  simulateDoubleStart() {
    if (this.phase !== 'voting') this.start();
    this.start(undefined, this.state.hostId);
  }
  /** UX-002: a peer presses browser Back mid-round. Nobody else is affected. */
  simulatePeerBack(id: string) {
    const p = this.person(id);
    if (!p) return;
    if (this.state.decisions.back === 'leave') {
      p.leftAt = Date.now();
      this.log(`${p.name} pressed Back (O3 = Back is Leave): they left the room`, 'UX-032');
    } else {
      p.steppedOut = true;
      this.log(
        `${p.name} pressed Back: stepped out, still counted, can Return in 1 tap. Nobody is stranded on a stale Lobby`,
        'UX-002',
      );
    }
    this.emit();
  }
  simulateKick(id = this.state.selfId) {
    const p = this.person(id);
    if (!p) return;
    p.leftAt = Date.now();
    p.removedBy = this.state.hostId;
    this.log(
      `${this.nameOf(this.state.hostId)} removed ${p.name}: terminal state in place ("Hana removed you from Sprint 42")`,
      'UX-010',
    );
    this.emit();
  }
  everyoneVotes() {
    const r = this.activeRound;
    if (!r || this.phase !== 'voting') return;
    for (const id of this.countedVoterIds())
      if (!(id in r.votes) && id !== this.state.selfId)
        r.votes[id] = this.peerFace(this.person(id)!);
    this.checkAllIn();
    this.emit();
  }
  peerVotes(id: string, face?: string) {
    const p = this.person(id);
    if (!p) return;
    this.vote(face ?? this.peerFace(p), id);
  }
  setDecision<K extends keyof Decisions>(k: K, v: Decisions[K]) {
    this.state.decisions[k] = v;
    this.emit();
  }
  setPeersAutoVote(on: boolean) {
    this.state.peersAutoVote = on;
    if (on && this.phase === 'voting') this.planPeers();
    this.emit();
  }

  // ── clock ──
  tick(now = Date.now()) {
    const s = this.state;
    let changed = false;
    // pending commits (undo windows)
    for (const p of Array.from(s.pending)) {
      if (now >= p.commitAt) {
        p.commit();
        s.pending = s.pending.filter((x) => x !== p);
        changed = true;
      }
    }
    if (s.notices.length && now >= s.notices[0]!.expiresAt) {
      s.notices = [];
      changed = true;
    }
    // simulated peers
    if (this.phase === 'voting' && s.peersAutoVote) {
      for (const [id, at] of Array.from(this.peerPlan)) {
        if (now >= at) {
          this.peerPlan.delete(id);
          const p = this.person(id);
          if (
            p &&
            p.online &&
            p.role === 'voter' &&
            !p.leftAt &&
            !(id in (this.activeRound?.votes ?? {}))
          ) {
            this.activeRound!.votes[id] = this.peerFace(p);
            this.checkAllIn();
            changed = true;
          }
        }
      }
    }
    // settle window → auto-reveal
    if (s.settleUntil && now >= s.settleUntil) {
      if (this.allInAndSynced()) this.reveal(s.hostId, 'auto');
      else s.settleUntil = undefined;
      changed = true;
    }
    if (changed) this.emit();
  }

  /** Undo the most recent pending action. */
  undo() {
    const p = this.state.pending[this.state.pending.length - 1];
    if (!p) return;
    p.undo();
    this.state.pending = this.state.pending.filter((x) => x !== p);
    this.state.notices = [];
    this.emit();
  }

  // ── internals ──
  private refuse(text: string) {
    this.notify(text, 'warning');
    this.emit();
  }
  private pendingAction(label: string, commit: () => void, undo: () => void, undoLabel = 'Undo') {
    const commitAt = Date.now() + 5000;
    this.state.pending.push({ id: nextId++, label, commitAt, commit, undo });
    this.notify(label, 'info', undoLabel);
  }
  private closeActive() {
    const r = this.activeRound;
    if (r) r.closedAt = Date.now();
  }
  private allInAndSynced(): boolean {
    const r = this.activeRound;
    if (!r || r.revealedAt) return false;
    const ids = this.countedVoterIds();
    if (ids.length === 0) return false;
    const everyoneIn = ids.every((id) => id in r.votes);
    // UX-001 gate: every counted voter's client is synced; a reloading client cannot trigger reveal
    const synced = ids.every((id) => this.person(id)?.synced);
    return everyoneIn && synced && this.state.connection === 'live';
  }
  private checkAllIn() {
    if (this.allInAndSynced()) {
      const ms = this.state.decisions.settleMs;
      // UX-014: the window restarts on every vote change; with O11 = none, reveal at once
      if (ms <= 0) this.reveal(this.state.hostId, 'auto');
      else this.state.settleUntil = Date.now() + ms;
    } else {
      this.state.settleUntil = undefined;
    }
  }
  private planPeers(revote = false) {
    this.peerPlan.clear();
    if (!this.state.peersAutoVote) return;
    const now = Date.now();
    for (const p of this.present) {
      if (p.id === this.state.selfId || p.role !== 'voter') continue;
      this.peerPlan.set(p.id, now + 1200 + Math.random() * (revote ? 2500 : 5000));
    }
  }
  private peerFace(p: Person): string {
    const cards = this.scale.cards;
    const target = Math.min(cards.length - 1, Math.max(0, Math.floor(cards.length * 0.62)));
    const jitter = Math.random() < 0.25 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const i = Math.min(cards.length - 1, Math.max(0, target + p.lean + jitter));
    return cards[i] ?? cards[0] ?? '?';
  }
}

/** Summary of the session for the summary card, the CLI exit print and Copy summary (UX-040, UX-103). */
export function sessionSummary(m: RoomModel): {
  name: string;
  minutes: number;
  rows: { key: string; title: string; value: string }[];
  total?: number | undefined;
  hnchd: number;
  leftovers: number;
  text: string;
} {
  const s = m.state;
  const rows = m.done.map((x) => ({ key: x.key, title: x.title, value: x.value ?? '–' }));
  const numeric = rows.filter((r) => /^\d+(\.\d+)?$/u.test(r.value));
  const total = numeric.length ? numeric.reduce((a, r) => a + Number(r.value), 0) : undefined;
  const hnchd = m.history.filter((r) => {
    const vals = Object.values(r.votes).filter((v) => v !== PASS);
    return vals.length >= 2 && new Set(vals).size === 1;
  }).length;
  const minutes = Math.max(1, Math.round(((s.endedAt ?? Date.now()) - s.createdAt) / 60_000));
  const leftovers = m.queue.length + m.skipped.length;
  const text = [
    `${s.name} · ${rows.length} stories${total !== undefined ? ` · ${total} pts` : ''} · ${minutes} min`,
    ...rows.map((r) => `${r.key ? `${r.key} ` : ''}${r.title}\t${r.value}`),
  ].join('\n');
  return { name: s.name, minutes, rows, total, hnchd, leftovers, text };
}
