/**
 * Access control shapes per ADR-0009.
 *
 * The wire format for the join handshake — how these values ride on
 * the `GET /rooms/:code` resolve call and on the subsequent WebSocket
 * upgrade to `/ws/:uuid` — is pinned in ADR-0016. Password hashing
 * uses PBKDF2-SHA-256 per ADR-0017. Invite-only is dropped from v1
 * (ADR-0017); invite types are retained as reserved placeholders.
 *
 * The relay treats `PasswordHash` and `InviteToken` as opaque byte
 * sequences; it compares but does not interpret them. Plaintext
 * passwords never leave the client.
 */

/**
 * A password hash submitted by a joiner to a password-protected room.
 * Hashing uses PBKDF2-SHA-256 with 100K iterations, 32-byte output,
 * hex-encoded (ADR-0017). Salt is the room UUID. From the relay's
 * perspective, this is an opaque string that either matches the
 * registered hash or does not.
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
 * `room-full` is returned when a room has reached `MAX_ROOM_PARTICIPANTS`
 * (enforced at WS upgrade in the relay, ADR-0020). Enumerating it here
 * keeps the type closed so downstream code can exhaustively switch.
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

/**
 * Maximum number of participants allowed in a single room.
 */
export const MAX_ROOM_PARTICIPANTS = 20
