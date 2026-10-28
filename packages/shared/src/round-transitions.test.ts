import { describe, it, expect } from 'vitest';
import type { RoundStatus } from './doc.js';
import { canEnterTerminal, isRecordedStatus, isTerminalStatus } from './round-transitions.js';

// Transition table: every member of RoundStatus and its active/terminal split.
const TABLE: { status: RoundStatus; terminal: boolean }[] = [
  { status: 'pending', terminal: false },
  { status: 'voting', terminal: false },
  { status: 'revealed', terminal: true },
  { status: 'skipped', terminal: true },
  { status: 'discarded', terminal: true },
];

describe('round-transitions', () => {
  for (const { status, terminal } of TABLE) {
    it(`isTerminalStatus('${status}') → ${terminal}`, () => {
      expect(isTerminalStatus(status)).toBe(terminal);
    });

    it(`canEnterTerminal('${status}') → ${!terminal} (complement)`, () => {
      expect(canEnterTerminal(status)).toBe(!terminal);
    });
  }

  it('canEnterTerminal is the exact negation of isTerminalStatus', () => {
    for (const { status } of TABLE) {
      expect(canEnterTerminal(status)).toBe(!isTerminalStatus(status));
    }
  });
});

// Exercises: round-transitions:isRecordedStatus
describe('isRecordedStatus', () => {
  it('is true for a round that left an entry: revealed or skipped', () => {
    expect(isRecordedStatus('revealed')).toBe(true);
    expect(isRecordedStatus('skipped')).toBe(true);
  });

  // A discarded round is terminal and a tombstone (ADR-0046): over, and not
  // to be shown. This is where the two predicates part.
  it('is false for a discarded round, which is terminal all the same', () => {
    expect(isRecordedStatus('discarded')).toBe(false);
    expect(isTerminalStatus('discarded')).toBe(true);
  });

  it('is false for a round that is still running', () => {
    expect(isRecordedStatus('pending')).toBe(false);
    expect(isRecordedStatus('voting')).toBe(false);
  });
});
