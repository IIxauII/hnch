import { describe, it, expect } from 'vitest';
import type { RoundStatus } from './doc.js';
import { canEnterTerminal, isTerminalStatus } from './round-transitions.js';

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
