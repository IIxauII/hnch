/**
 * PROTOTYPE (#643), throwaway. The one interaction registry (R-51) and the
 * card-key resolver (D5 / R-17), framework-free. Web keycaps, tooltips, the `?`
 * sheet, the CLI footer, the CLI `?` overlay and the CLI menu are all generated
 * from COMMANDS, so "the same keys work on web desktop and in the terminal".
 *
 * Copied verbatim to packages/cli/src/prototype-643/interaction.ts. Edit both or neither.
 */
import type { Phase } from './room-model';

export interface Command {
  id: string;
  label: string;
  /** Display keys. '⏎' Enter, 'esc' Escape. Card faces are not listed: you type the face. */
  keys: string[];
  phases: Phase[] | 'any';
  role: 'host' | 'anyone' | 'voter';
  /** Destructive: never a bare single key; needs Undo or a confirm (R-11). */
  destructive?: 'undo' | 'confirm';
  /** Footer priority: lower shows first; footer keeps ≤5 (≤3 under 72 columns) + `? help` + `q leave`. */
  priority: number;
  /** Surfaces that have it. 'cli-only' commands have no web key (quit). */
  surfaces: ('web' | 'cli')[];
}

export const COMMANDS: Command[] = [
  {
    id: 'primary',
    label: 'Start / Reveal / Accept · Next',
    keys: ['⏎'],
    phases: 'any',
    role: 'host',
    priority: 0,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'vote',
    label: 'Vote: type the card face',
    keys: ['0–9', 'A–Z'],
    phases: ['voting'],
    role: 'voter',
    priority: 1,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'pass',
    label: 'Pass (sit this one out)',
    keys: ['-'],
    phases: ['voting'],
    role: 'voter',
    priority: 2,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'pick',
    label: 'Pick another value',
    keys: ['←', '→'],
    phases: ['revealed'],
    role: 'host',
    priority: 2,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'revote',
    label: 'Re-vote',
    keys: ['r'],
    phases: ['revealed'],
    role: 'host',
    priority: 3,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'skip',
    label: 'Skip story',
    keys: ['s'],
    phases: ['voting', 'revealed'],
    role: 'host',
    destructive: 'undo',
    priority: 6,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'undo',
    label: 'Undo',
    keys: ['u'],
    phases: 'any',
    role: 'anyone',
    priority: 1,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'add',
    label: 'Add stories (paste many)',
    keys: ['+'],
    phases: ['waiting', 'revealed'],
    role: 'anyone',
    priority: 4,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'invite',
    label: 'Invite',
    keys: ['i'],
    phases: 'any',
    role: 'anyone',
    priority: 5,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'watch',
    label: 'Just watching / Vote instead',
    keys: ['w'],
    phases: 'any',
    role: 'anyone',
    priority: 7,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'people',
    label: 'People',
    keys: ['p'],
    phases: 'any',
    role: 'anyone',
    priority: 8,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'stories',
    label: 'Stories',
    keys: ['t'],
    phases: 'any',
    role: 'anyone',
    priority: 8,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'menu',
    label: 'Menu (leave, end, settings)',
    keys: ['m'],
    phases: ['waiting', 'revealed'],
    role: 'anyone',
    priority: 9,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'help',
    label: 'Keys and help',
    keys: ['?'],
    phases: 'any',
    role: 'anyone',
    priority: 98,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'close',
    label: 'Close the top layer',
    keys: ['esc'],
    phases: 'any',
    role: 'anyone',
    priority: 99,
    surfaces: ['web', 'cli'],
  },
  {
    id: 'leave',
    label: 'Leave (q)',
    keys: ['q'],
    phases: ['waiting', 'revealed'],
    role: 'anyone',
    priority: 99,
    surfaces: ['cli'],
  },
  {
    id: 'end',
    label: 'End for everyone',
    keys: [],
    phases: 'any',
    role: 'host',
    destructive: 'confirm',
    priority: 100,
    surfaces: ['web', 'cli'],
  },
];

/** Commands available now, for the footer / `?` sheet. */
export function commandsFor(
  phase: Phase,
  isHost: boolean,
  isVoter: boolean,
  surface: 'web' | 'cli',
): Command[] {
  return COMMANDS.filter(
    (c) =>
      c.surfaces.includes(surface) &&
      (c.phases === 'any' || c.phases.includes(phase)) &&
      (c.role === 'anyone' || (c.role === 'host' && isHost) || (c.role === 'voter' && isVoter)),
  ).toSorted((a, b) => a.priority - b.priority);
}

/** One-row footer: ≤5 hints (≤3 under 72 columns) + `? help` + `q leave` (R-46). */
export function footerHints(
  phase: Phase,
  isHost: boolean,
  isVoter: boolean,
  columns: number,
  primaryLabel?: string,
): string[] {
  const max = columns < 72 ? 3 : 5;
  const cmds = commandsFor(phase, isHost, isVoter, 'cli').filter(
    (c) => c.id !== 'help' && c.id !== 'close' && c.id !== 'leave' && !c.destructive,
  );
  const hints = cmds.slice(0, max).map((c) => {
    if (c.id === 'primary') return `⏎ ${primaryLabel ?? 'go'}`;
    if (c.id === 'vote') return 'type a card';
    return `${c.keys[0]} ${c.label.split(' (')[0]?.toLowerCase()}`;
  });
  hints.push('? help');
  if (phase !== 'voting') hints.push('q leave');
  return hints;
}

// ── Card-key resolver (R-17) ───────────────────────────────────────────────

export interface ResolveResult {
  /** The face to commit now, if any. */
  commit?: string | undefined;
  /** The pending prefix (shown as a dashed tile + "typing…"), '' if none. */
  pending: string;
  /** Characters still to absorb after a unique-prefix commit ("1" then "3" of 13 is absorbed). */
  absorb: string;
}

/**
 * Feed one key. A unique prefix commits at once, and the rest of that face's
 * spelling is then absorbed for 450 ms. An exact face that is also the start of
 * another face (`2` with `21` on Fibonacci) waits: it commits on ⏎, a
 * non-extending key, or after 450 ms (`flush`). Case-insensitive for letters.
 */
export function resolveKey(
  cards: string[],
  pending: string,
  absorb: string,
  key: string,
): ResolveResult {
  const k = key.toLowerCase();
  if (absorb && absorb[0]?.toLowerCase() === k) return { pending: '', absorb: absorb.slice(1) };
  const next = (pending + k).toLowerCase();
  const matches = cards.filter((c) => c.toLowerCase().startsWith(next));
  if (matches.length === 0) {
    // non-extending key: commit the pending exact face (if any), then retry the key alone
    const exact = cards.find((c) => c.toLowerCase() === pending.toLowerCase());
    if (pending) {
      const retry = resolveKey(cards, '', '', key);
      return {
        commit: exact ?? retry.commit,
        pending: exact ? retry.pending : retry.pending,
        absorb: retry.absorb,
      };
    }
    return { pending: '', absorb: '' };
  }
  if (matches.length === 1) {
    const face = matches[0]!;
    return { commit: face, pending: '', absorb: face.slice(next.length) };
  }
  return { pending: next, absorb: '' };
}

/** Timeout or ⏎ while a prefix is pending: commit it if it is an exact face. */
export function flushKey(cards: string[], pending: string): string | undefined {
  return cards.find((c) => c.toLowerCase() === pending.toLowerCase());
}

export const KEY_SETTLE_MS = 450;
