/**
 * PROTOTYPE (#643). Stage-scoped UI state (clock, typing buffer, value chips)
 * and small pure helpers shared by the stage sub-components. Provided by
 * ProtoRoomStageComponent, so every stage piece sees the same instance.
 */
import { Injectable, type OnDestroy, signal } from '@angular/core';

import {
  AVATAR_VARIANTS,
  computeOutcome,
  type Outcome,
  PASS,
  type Person,
  type RoomModel,
  type Round,
  SCALES,
} from '../../room-model';

@Injectable()
export class StageUi implements OnDestroy {
  /** Wall clock for the stopwatch; ticks 4×/s, only the story bar reads it. */
  readonly now = signal(Date.now());
  /** Card-key prefix waiting to commit ("1" before "13"); '' when none (R-17). */
  readonly pending = signal('');
  /** Rest of a face being absorbed after a unique-prefix commit. */
  absorb = '';
  /** In-stage value chip row under the hero (host, coarse pointer; R-36). */
  readonly chipsOpen = signal(false);

  private readonly clock = setInterval(() => this.now.set(Date.now()), 250);

  ngOnDestroy() {
    clearInterval(this.clock);
  }
}

/** m:ss with tabular digits upstream ("0:42", "12:05"). */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

/** Avatar dot fill + initials ink for the current theme (§5.1 render-time variants). */
export function dotColors(
  p: Person | undefined,
  theme: 'light' | 'dark',
): { bg: string; ink: string } {
  const v = AVATAR_VARIANTS[p?.color ?? 'graphite'];
  return theme === 'dark' ? { bg: v.dark, ink: v.darkInk } : { bg: v.light, ink: v.lightInk };
}

/** One face size per deck, picked by the longest face (§5.2, PW #9). */
export function faceSize(cards: string[]): 'numeral' | 'headline' | 'label' {
  const longest = Math.max(...cards.map((c) => [...c].length), 1);
  if (longest <= 2) return 'numeral';
  if (longest === 3) return 'headline';
  return 'label';
}

/**
 * The shortest spelling that commits a face by keyboard, for letter-scale
 * keycaps. undefined when the face cannot be typed (e.g. "½"): those stay
 * reachable with the arrow keys (R-51).
 */
export function keycapFor(cards: string[], face: string): string | undefined {
  if (!/^[a-z0-9]+$/iu.test(face)) return undefined;
  const lower = face.toLowerCase();
  for (let n = 1; n <= face.length; n++) {
    const p = lower.slice(0, n);
    const hits = cards.filter((c) => c.toLowerCase().startsWith(p));
    if (hits.length === 1) return face.slice(0, n);
  }
  return face;
}

export function faceText(v: string | undefined): string {
  if (v === undefined) return '';
  return v === PASS ? 'Pass' : v;
}

export function joinNames(names: string[]): string {
  return names.join(', ');
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** 1 for a first vote, 2 for the first re-vote, … (UX-077: "2nd vote"). */
export function voteNumber(m: RoomModel, round: Round | undefined): number {
  let n = 1;
  let r = round;
  while (r?.revoteOf) {
    n++;
    const prevId: string = r.revoteOf;
    r = m.state.rounds.find((x) => x.id === prevId);
  }
  return n;
}

export function outcomeOf(m: RoomModel, round: Round): Outcome {
  return computeOutcome(
    round,
    SCALES[round.scaleId] ?? SCALES['fibonacci']!,
    m.state.people,
    m.state.selfId,
    m.state.decisions.rule,
  );
}

/**
 * "Previous: PROJ-101 → 8" for the first round after an Accept (§5.4 stamp,
 * UX-033). Only when this round was started right after the accept.
 */
export function previousAccepted(m: RoomModel): { label: string; value: string } | undefined {
  const r = m.activeRound;
  if (!r || r.revoteOf) return undefined;
  const live = m.liveRounds;
  const i = live.indexOf(r);
  const prev = i > 0 ? live[i - 1] : undefined;
  if (!prev?.acceptedValue || !prev.closedAt || prev.storyId === r.storyId) return undefined;
  if (r.startedAt - prev.closedAt > 120_000) return undefined;
  const story = m.state.stories.find((s) => s.id === prev.storyId);
  return { label: story?.key || prev.title, value: prev.acceptedValue };
}

/** "Last: PROJ-100 Search · Agreed 5" in waiting (§6.1 voter waiting). */
export function lastResultLine(m: RoomModel): string | undefined {
  const closed = m.history.filter((r) => r.closedAt && r.acceptedValue);
  const r = closed[closed.length - 1];
  if (!r) return undefined;
  const o = outcomeOf(m, r);
  const story = m.state.stories.find((s) => s.id === r.storyId);
  const name = [story?.key, story?.title ?? r.title].filter(Boolean).join(' ');
  const word = o.word && o.kind !== 'none' ? `${o.word} ` : '';
  return `Last: ${name} · ${word}${r.acceptedValue ?? ''}`;
}

/** Spoken result for the live region (R-34): "Close, suggested 8, range 5 to 13; low Ana, high Dev". */
export function spokenResult(o: Outcome): string {
  switch (o.kind) {
    case 'agreed':
      return `Agreed, everyone said ${o.suggestion ?? ''}`;
    case 'one':
      return `1 vote, ${o.suggestion ?? ''}`;
    case 'none':
      return 'No votes';
    case 'split':
      return `Split, ${o.min ?? ''} to ${o.max ?? ''}`;
    case 'close': {
      const sides = [
        o.low ? `low ${joinNames(o.low.names)}` : '',
        o.high ? `high ${joinNames(o.high.names)}` : '',
      ].filter(Boolean);
      return `Close, suggested ${o.suggestion ?? ''}, range ${o.min ?? ''} to ${o.max ?? ''}${sides.length ? `; ${sides.join(', ')}` : ''}`;
    }
  }
}
