/**
 * Access control shapes per ADR-0009.
 *
 * The wire format for the join handshake — how these values ride on
 * the `GET /rooms/:code` resolve call and on the subsequent WebSocket
 * upgrade to `/ws/:uuid` — is pinned in ADR-0016. Password hashing
 * scheme and invite URL format are still open (tracked on ADR-0009's
 * action items) and land in Phase 5.
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
 * Wire format per ADR-0016:
 *   - `deviceId` → `did` query param on the WS upgrade URL (always).
 *   - `passwordHash` → `pw` query param (password-protected rooms only).
 *   - `inviteToken` → `inv` query param (invite-only rooms only).
 *   - `roomCode` is resolved to a UUID via `GET /rooms/:code` ahead of
 *     the WS upgrade, so it does not appear on the WS URL itself.
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
  | 'malformed-credentials'

/**
 * Relay response to a join attempt.
 */
export type JoinResponse =
  | { ok: true }
  | { ok: false; reason: JoinRejectionReason }

/**
 * WebSocket close-code table per ADR-0016. Private-use codes
 * (4000–4099 block reserved for hnch) signal a `JoinRejectionReason`
 * on the close frame. Both client and relay import from this constant
 * so the wire contract has one source.
 */
export const JOIN_REJECTION_CLOSE_CODES = {
  'unknown-room': 4001,
  'wrong-password': 4002,
  'invalid-invite': 4003,
  'expired-invite': 4004,
  'invite-already-redeemed': 4005,
  'room-full': 4006,
  'malformed-credentials': 4010,
} as const satisfies Record<JoinRejectionReason, number>

/**
 * Reverse lookup: close code → reason. Useful on the client side when
 * interpreting the WS close event.
 */
export const JOIN_REJECTION_REASONS_BY_CODE: ReadonlyMap<number, JoinRejectionReason> =
  new Map(
    (Object.entries(JOIN_REJECTION_CLOSE_CODES) as [JoinRejectionReason, number][])
      .map(([reason, code]) => [code, reason]),
  )
