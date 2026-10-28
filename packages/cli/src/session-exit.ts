/**
 * The CLI's one way out of a live session — quit, the host ending the
 * session or removing this peer, and the relay refusing the connection — for
 * `create`, `join` and `resume`, which used to carry two copies of it each.
 * The entry flows say why; this owns the steps and their order:
 *
 *   take the terminal UI down → close the session → forget what the device
 *   should no longer remember → say why → exit.
 *
 * What a refusal forgets, says and exits with is decided by
 * `refusalVerdict`, and a room the relay no longer has by
 * `onSessionExpired`: this applies their answer. A cache that cannot be
 * written is no reason to keep the user in a session that is gone: it is
 * reported, and the exit goes on.
 */

import type { JoinRejectionReason } from '@hnch/shared';

import { clearPasswordHash, removeEntry } from './last-session.js';
import { refusalVerdict, type RefusalVerdict } from './refusal.js';
import { onSessionExpired } from './session-expired.js';

/**
 * Why a live session is being left.
 *
 * - `left`: the user quit.
 * - `ended`: the host ended the session for everyone.
 * - `removed`: the host removed this peer.
 * - `refused`: the relay turned the connection away, a room it no longer
 *   has (`unknown-room`) included.
 *
 * `ended` and `removed` carry the session events driver's message.
 */
export type SessionEnding =
  | { readonly kind: 'left' }
  | { readonly kind: 'ended' | 'removed'; readonly message: string }
  | { readonly kind: 'refused'; readonly reason: JoinRejectionReason };

/** The room, as the relay issued it: the cache entry was recorded under its UUID. */
export interface ExitingRoom {
  readonly roomCode: string;
  readonly roomUuid: string;
}

/** What the exit needs of the session: which room it is, and how to close it. */
export interface ExitingSession extends ExitingRoom {
  /** Close the session here: the socket, the drivers, the doc. Writes nothing. */
  teardown(): void;
}

export interface SessionExitOptions {
  /**
   * The room being opened, for an ending that comes before the session is
   * (`join` and `resume` know it up front). The bound session takes over.
   */
  readonly room?: ExitingRoom;
  /** For the refusal verdict: this device has been in the session. */
  readonly wasIn: () => boolean;
  /** For the refusal verdict: a password was typed for this attempt. */
  readonly typedPassword: boolean;
  /** Default: stderr. */
  readonly print?: (line: string) => void;
  /** Default: `process.exit`. */
  readonly exit?: (code: number) => never;
  /** Default: the last-session cache. */
  readonly cache?: {
    removeEntry(roomUuid: string): void;
    clearPasswordHash(roomUuid: string): void;
  };
}

export interface SessionExit {
  /** The session is open: an exit from here on closes it. */
  bind(session: ExitingSession): void;
  /** The terminal UI is up: an exit from here on takes it down first. */
  attach(ui: { unmount(): void }): void;
  /**
   * Leave the session, for this reason, and end the process. Only the first
   * ending counts: one that arrives while an exit is under way is dropped.
   */
  end(ending: SessionEnding): Promise<never>;
}

export function sessionExit(opts: SessionExitOptions): SessionExit {
  const print = opts.print ?? ((line: string) => console.error(line));
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const cache = opts.cache ?? { removeEntry, clearPasswordHash };
  let session: ExitingSession | undefined;
  let ui: { unmount(): void } | undefined;
  let exiting = false;

  /** Forget what the verdict says to. Never throws. */
  function forget(remembered: RefusalVerdict['remembered'], room: ExitingRoom | undefined): void {
    if (room === undefined || remembered === 'keep') return;
    try {
      if (remembered === 'forget-password') cache.clearPasswordHash(room.roomUuid);
      else cache.removeEntry(room.roomUuid);
    } catch (err) {
      print(`Failed to clear cached session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    bind(s) {
      session = s;
    },
    attach(u) {
      ui = u;
    },
    async end(ending) {
      // The process ends at the end of this; nothing after it is to run.
      if (exiting) return new Promise<never>(() => {});
      exiting = true;

      const room: ExitingRoom | undefined = session ?? opts.room;
      // Decided on the session as it was, before it is closed. A refusal
      // that ends the session in the terminal comes once the UI is up
      // (`watchForRefusal`), when there is always a room to name.
      const verdict =
        ending.kind === 'refused' && ending.reason !== 'unknown-room'
          ? refusalVerdict(ending.reason, {
              roomCode: room?.roomCode ?? '',
              wasIn: opts.wasIn(),
              typedPassword: opts.typedPassword,
            })
          : null;

      ui?.unmount();
      session?.teardown();

      if (ending.kind === 'refused') {
        if (verdict === null) {
          return onSessionExpired({
            clearLastSession: () => {
              if (room !== undefined) cache.removeEntry(room.roomUuid);
            },
            logger: { error: print },
            exit,
          });
        }
        forget(verdict.remembered, room);
        print(verdict.message);
        return exit(verdict.exitCode);
      }

      forget('forget-session', room);
      if (ending.kind === 'ended' || ending.kind === 'removed') print(ending.message);
      return exit(0);
    },
  };
}
