/**
 * What a session command does when the relay turns its connection away for
 * good (ADR-0050): the terminal UI comes down, a line says why and what to
 * do about it, and the process ends. One place for `create`, `join` and
 * `resume`, which used to have a copy each and had drifted apart.
 *
 * `unknown-room` is not in here: a session that is gone has a path of its
 * own (`onSessionExpired`).
 */

import { MAX_ROOM_PARTICIPANTS, type JoinRejectionReason } from '@hnch/shared';

/** A refusal that ends the session in the terminal. */
export type EndingRefusal = Exclude<JoinRejectionReason, 'unknown-room'>;

export interface RefusalWatch {
  /** What the relay said, or `null` while it has said nothing. */
  refused(): EndingRefusal | null;
  /** The relay has refused the connection. Takes the UI down if it is up. */
  note(reason: EndingRefusal): void;
  /**
   * The UI is up: from here on a refusal takes it down. One that came
   * before there was anything to take down does so now — the connection is
   * being made while the UI is still being put together, and the relay can
   * be quicker.
   */
  attach(unmount: () => void): void;
}

export function watchForRefusal(): RefusalWatch {
  let refused: EndingRefusal | null = null;
  let unmount: (() => void) | undefined;
  return {
    refused: () => refused,
    note(reason) {
      refused = reason;
      unmount?.();
    },
    attach(takeDown) {
      unmount = takeDown;
      if (refused !== null) takeDown();
    },
  };
}

export interface RefusalContext {
  /** The session's code, for the line that says how to get back in. */
  readonly roomCode: string;
  /**
   * This device has been in the session: in this run, or in the one that is
   * being resumed. What it remembers of it is worth keeping.
   */
  readonly wasIn: boolean;
  /** A password was typed for this attempt. */
  readonly typedPassword: boolean;
}

export interface RefusalVerdict {
  /** For stderr, as it is. */
  readonly message: string;
  readonly exitCode: 0 | 1;
  /** What becomes of the session's entry in the last-session cache. */
  readonly remembered: 'keep' | 'forget-password' | 'forget-session';
}

export function refusalVerdict(reason: EndingRefusal, ctx: RefusalContext): RefusalVerdict {
  switch (reason) {
    case 'wrong-password':
      // Typed just now and refused at the door: it was typed wrong. Nothing
      // has changed, and nothing of the attempt is worth remembering.
      if (!ctx.wasIn && ctx.typedPassword) {
        return {
          message: 'That password is incorrect.',
          exitCode: 1,
          remembered: 'forget-session',
        };
      }
      // Refused in the middle of the session, or with the password this
      // device had stored: the host has set one, or another one, since.
      return {
        message: `Password changed — rejoin with: hnch join ${ctx.roomCode} --password`,
        exitCode: 0,
        remembered: 'forget-password',
      };
    case 'room-full':
      return {
        message: `This room is full (max ${MAX_ROOM_PARTICIPANTS} participants).`,
        exitCode: 1,
        // There may be room later, for someone who has a place to come back to.
        remembered: ctx.wasIn ? 'keep' : 'forget-session',
      };
    default:
      return {
        message: `The relay refused the connection (${reason}).`,
        exitCode: 1,
        remembered: ctx.wasIn ? 'keep' : 'forget-session',
      };
  }
}
