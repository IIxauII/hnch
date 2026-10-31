/** PROTOTYPE (#643). People helpers shared by the header stack, People sheet and rail. */
import { PASS, type Person, type RoomModel } from '../../room-model';
import type { DotState } from './dot.component';

export interface PersonRow {
  p: Person;
  you: boolean;
  host: boolean;
  dot: DotState;
  /** Glyph + word, never colour alone. '' when there is nothing to say. */
  state: string;
  /** The revealed card face as people read it ('Pass', never the sentinel: UX-039). */
  value?: string | undefined;
}

/** Face as shown to people: the abstain sentinel always reads "Pass" (UX-039). */
export function faceLabel(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v === PASS ? 'Pass' : v;
}

export function personRow(m: RoomModel, p: Person): PersonRow {
  const r = m.activeRound;
  const you = p.id === m.state.selfId;
  const host = p.id === m.state.hostId;
  const vote = r?.votes[p.id];
  let dot: DotState = null;
  let state = '';
  if (!p.online || p.steppedOut) {
    dot = 'away';
    state = '◌ away';
  } else if (p.role === 'viewer') {
    dot = 'watching';
    state = '– watching';
  } else if (m.phase === 'voting') {
    dot = vote !== undefined ? 'voted' : 'waiting';
    state = vote !== undefined ? '✓ voted' : '· waiting';
  } else if (m.phase === 'revealed') {
    dot = vote !== undefined ? 'voted' : null;
    state = vote === PASS ? '– passed' : vote !== undefined ? '✓ voted' : '· no vote';
  }
  return {
    p,
    you,
    host,
    dot,
    state,
    value: m.phase === 'revealed' ? faceLabel(vote) : undefined,
  };
}

/** Present people, host first, then you, then by join order. */
export function orderedPeople(m: RoomModel): Person[] {
  const rank = (p: Person) => (p.id === m.state.hostId ? 0 : p.id === m.state.selfId ? 1 : 2);
  return m.present.toSorted((a, b) => rank(a) - rank(b) || a.joinedAt - b.joinedAt);
}

export function peopleSummary(m: RoomModel): string {
  const ps = m.present;
  const voting = ps.filter((p) => p.role === 'voter').length;
  const watching = ps.length - voting;
  return watching ? `${voting} voting · ${watching} watching` : `${voting} voting`;
}

/** Who the host hands to on Leave (same rule as RoomModel.leave). */
export function nextHost(m: RoomModel): Person | undefined {
  const me = m.self;
  return m.present.find((p) => p.id !== me?.id && p.online && p.synced);
}
