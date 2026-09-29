import { effect, inject, Injectable, signal, untracked, type Signal } from '@angular/core';
import { hashPassword, normalizePassword, patchRoomAccess, resolveRoom } from '@hnch/shared';

import { AppPreferenceService } from './app-preference.service';
import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';

/** Access modes per ADR-0009. Invite-only dropped from v1 (ADR-0017). */
export type AccessMode = 'open' | 'password';

/** How an access change ended. */
export type AccessChangeResult =
  /** The relay took it. */
  | 'applied'
  /** The relay refused, or could not be reached. Nothing changed. */
  | 'failed'
  /** There was nothing to send: no session, or a blank password. */
  | 'skipped';

/**
 * Whether the current session asks for a password, and the two ways to
 * change that.
 *
 * Access is relay state (ADR-0009), not doc state, so it is neither synced
 * nor observable: it is what the relay answered last. This service is where
 * that answer is kept — for the session the app currently holds, reset when
 * the session changes.
 *
 * It is a service rather than state on a screen for one reason. A change
 * takes a moment (the hash alone is 100 000 rounds) and the sheet it is made
 * from can be closed in that moment: the field commits on blur, and the tap
 * that blurs it is usually the tap on Done. Whatever is waiting for the relay
 * has to outlive the sheet, or the relay ends up locked with the Lobby
 * showing it open.
 */
@Injectable({ providedIn: 'root' })
export class SessionAccessService {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly docService = inject(DocService);
  private readonly lastSessionService = inject(LastSessionService);

  private readonly modeSignal = signal<AccessMode>('open');
  private readonly savingSignal = signal(false);
  /**
   * Bumped by every lookup, every change and every new session. An answer
   * that was asked for under an older number is dropped: something newer
   * knows better.
   */
  private seq = 0;
  /** The code a lookup is in flight for, if any. */
  private lookupFor: string | null = null;

  /** What the relay enforces, as far as it has told this device. */
  readonly mode: Signal<AccessMode> = this.modeSignal.asReadonly();

  /** True while a change is on its way to the relay. */
  readonly saving: Signal<boolean> = this.savingSignal.asReadonly();

  constructor() {
    // A different session: what was known about the last one is not about
    // this one.
    effect(() => {
      this.docService.sessionEpoch();
      untracked(() => {
        this.seq += 1;
        this.lookupFor = null;
        this.modeSignal.set('open');
        this.savingSignal.set(false);
      });
    });

    // Ask whenever a connection has synced — on joining, and again after
    // every reconnect, since the mode may have changed while this peer was
    // away.
    effect(() => {
      if (this.docService.relaySynced()) untracked(() => void this.refresh());
    });
  }

  /**
   * Read the session's access mode back from the relay. Best-effort: a
   * failed lookup leaves the last known mode in place, and the connection
   * banner already tells the user the relay is unreachable.
   */
  async refresh(): Promise<void> {
    const code = this.docService.roomCode();
    if (code === null) return;
    // One lookup per code at a time.
    if (this.lookupFor === code) return;
    this.lookupFor = code;
    const seq = ++this.seq;
    try {
      const resolved = await resolveRoom(this.appPrefs.resolvedRelayHttpUrl(), code);
      if (seq !== this.seq) return;
      // Codes are handed out again once a session has expired.
      const uuid = this.docService.relayRoomUuid();
      if (uuid !== null && resolved.uuid !== uuid) return;
      this.modeSignal.set(resolved.accessMode === 'password' ? 'password' : 'open');
    } catch {
      // Keep what we have.
    } finally {
      if (this.lookupFor === code) this.lookupFor = null;
    }
  }

  /**
   * Protect the session with `password`, or change the password it has.
   * A blank password is not a password: nothing is sent.
   */
  async setPassword(password: string): Promise<AccessChangeResult> {
    if (normalizePassword(password) === '') return 'skipped';
    return this.change(password);
  }

  /** Open the session: anyone with the code can join. */
  async removePassword(): Promise<AccessChangeResult> {
    return this.change(null);
  }

  private async change(password: string | null): Promise<AccessChangeResult> {
    // The UUID the relay issued for this connection — not the one in the
    // doc, which every participant can write.
    const uuid = this.docService.relayRoomUuid();
    if (uuid === null || this.savingSignal()) return 'skipped';

    const epoch = this.docService.sessionEpoch();
    this.savingSignal.set(true);
    try {
      const hash = password === null ? null : await hashPassword(password, uuid);
      const answer = await patchRoomAccess(this.appPrefs.resolvedRelayHttpUrl(), uuid, hash);
      // The session this was for is gone; so is everything to update.
      if (this.docService.sessionEpoch() !== epoch) return 'applied';

      // The relay has spoken: show what it says, before anything that can
      // still go wrong.
      this.seq += 1;
      this.modeSignal.set(answer.accessMode === 'password' ? 'password' : 'open');

      // Our own socket still carries the old `pw`. Re-handshake, so the
      // change does not lock this client out on its next reconnect.
      this.docService.updateCredentials(hash);
      await this.remember(uuid, hash);
      return 'applied';
    } catch {
      return 'failed';
    } finally {
      if (this.docService.sessionEpoch() === epoch) this.savingSignal.set(false);
    }
  }

  /**
   * Keep the device's own way back in step with the change (ADR-0044). The
   * relay has already changed by now, so a failure to write the cache is not
   * a failure of the change.
   */
  private async remember(uuid: string, hash: string | null): Promise<void> {
    try {
      if (hash === null) {
        await this.lastSessionService.clearPasswordHash(uuid);
      } else {
        await this.lastSessionService.rememberPasswordHash(uuid, hash);
      }
    } catch (err) {
      console.warn('Failed to update the cached password hash:', err);
    }
  }
}
