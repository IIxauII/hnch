/**
 * Access control shapes per ADR-0009.
 *
 * The detailed join-handshake wire protocol is still to be designed
 * (see ADR-0009 action items — "design the invite flow protocol",
 * "choose a password-hashing scheme on the client"). This file holds
 * the type skeletons that the client and relay will share once that
 * design work lands.
 *
 * The relay treats `PasswordHash` and `InviteToken` as opaque byte
 * sequences; it compares but does not interpret them. Plaintext
 * passwords never leave the client.
 */

/**
 * A password hash submitted by a joiner to a password-protected room.
 * The hashing scheme is client-owned (TBD — argon2id is the planned
 * default per ADR-0009 action items). From the relay's perspective,
 * this is an opaque string that either matches the registered hash
 * or does not.
 */
export type PasswordHash = string

/**
 * A single-use invite token minted by the host for an invite-only room.
 * Delivered out-of-band (typically via URL hash) and redeemed at
 * socket-connect time. Tokens are short-lived and marked redeemed on
 * first successful use.
 */
export type InviteToken = string

/**
 * The join-credentials payload a client presents at socket-connect time.
 *
 * The exact wire format (URL query parameters, JSON handshake after
 * upgrade, etc.) is TBD — see ADR-0009 action items. This type models
 * the logical content regardless of the eventual transport.
 */
export interface JoinCredentials {
  /** The room code to join, in normalized form (uppercase, no dashes). */
  roomCode: string
  /** Required for password-protected rooms. */
  passwordHash?: PasswordHash
  /** Required for invite-only rooms. */
  inviteToken?: InviteToken
  /** The joiner's device ID (ADR-0005). Also serves as the session's participantId. */
  deviceId: string
}

/**
 * The set of reasons a join may be rejected by the relay.
 *
 * `room-full` is reserved for a possible future cap; there is no cap
 * in v1 per `project.md`, but enumerating it here keeps the type closed
 * so downstream code can exhaustively switch.
 */
export type JoinRejectionReason =
  | 'unknown-room'
  | 'wrong-password'
  | 'invalid-invite'
  | 'expired-invite'
  | 'invite-already-redeemed'
  | 'room-full'

/**
 * Relay response to a join attempt.
 */
export type JoinResponse =
  | { ok: true }
  | { ok: false; reason: JoinRejectionReason }
