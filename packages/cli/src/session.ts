/**
 * Session orchestrator for the CLI client.
 *
 * Manages the full lifecycle: mint/resolve room → init/join doc →
 * connect sync → wire host election + unanimous auto-reveal → expose mutation API.
 */

import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import {
  initDoc,
  joinDoc,
  projectDoc,
  currentRound,
  castVote,
  clearVote,
  revealRound as revealRoundMutation,
  appendRound,
  patchSettings,
  hashPassword,
  upsertParticipant,
  participantRole,
  FIBONACCI_SCALE,
  type DocProjection,
  type Scale,
  type Round,
  type JoinRejectionReason,
} from '@hnch/shared'
import { randomUUID } from 'node:crypto'
import { mintRoom, resolveRoom, patchRoomAccess } from './relay-api.js'
import { connect, type SyncConnection, type SyncStatus } from './sync.js'
import { startElection, type ElectionHandle } from './host-election.js'

export interface CreateSessionOptions {
  readonly participantId: string
  readonly displayName: string
  readonly relayUrl: string
  readonly sessionName?: string
  readonly password?: string
  readonly defaultScale?: Scale
}

export interface JoinSessionOptions {
  readonly participantId: string
  readonly displayName: string
  readonly relayUrl: string
  readonly roomCode: string
  readonly password?: string
  readonly onRejection?: (reason: JoinRejectionReason) => void
}

export interface SessionHandle {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  readonly roomCode: string
  readonly roomUuid: string

  /** Get current projection snapshot. */
  projection(): DocProjection
  /** Get current round (or null). */
  current(): Round | null
  /** Whether this client is the host. */
  isHost(): boolean
  /** Online participant IDs from awareness. */
  onlineIds(): Set<string>

  /** Cast a vote on the current round. */
  vote(card: string): void
  /** Clear vote on the current round. */
  unvote(): void
  /** Reveal the current round (host only). */
  reveal(): void
  /** Start a new round. */
  newRound(title?: string): string
  /** Re-vote: start new round linked to current. */
  revote(): string
  /** Update the room name. Pass undefined to remove. */
  updateName(name: string | undefined): void
  /** Update the default estimation scale. */
  updateScale(scale: Scale): void
  /** Update this participant's display name. */
  updateDisplayName(name: string): void
  /** Update room access mode (open or password-protected). */
  updateAccess(mode: 'open' | 'password', password?: string): Promise<void>
  /** Hand off host to target participant (host only, target must be online). */
  handoffHost(targetId: string): void
  /** Toggle this participant's role between voter and viewer. */
  toggleRole(): void

  /** Subscribe to doc changes. Returns unsubscribe fn. */
  onChange(cb: () => void): () => void
  /** Subscribe to sync status changes. Returns unsubscribe fn. */
  onStatusChange(cb: (status: SyncStatus) => void): () => void
  /** Subscribe to host changes. Skips initial value, fires only on actual changes. Returns unsubscribe fn. */
  onHostChange(cb: (newHostId: string) => void): () => void

  /** Disconnect and clean up. */
  disconnect(): void
}

export async function createSession(opts: CreateSessionOptions): Promise<SessionHandle> {
  let passwordHash: string | undefined
  // Mint room first to get UUID (needed as salt for password hash)
  const minted = await mintRoom(opts.relayUrl)

  if (opts.password) {
    passwordHash = await hashPassword(opts.password, minted.uuid)
    // Update room with password
    await patchRoomAccess(opts.relayUrl, minted.uuid, passwordHash)
  }

  const doc = new Y.Doc()
  const awareness = new Awareness(doc)

  const now = Date.now()
  initDoc(doc, {
    roomUuid: minted.uuid,
    createdAt: now,
    participantId: opts.participantId,
    displayName: opts.displayName,
    defaultScale: opts.defaultScale ?? FIBONACCI_SCALE,
    sessionName: opts.sessionName,
  })

  awareness.setLocalStateField('participantId', opts.participantId)

  return wireSession({
    doc,
    awareness,
    roomCode: minted.code,
    roomUuid: minted.uuid,
    participantId: opts.participantId,
    relayUrl: opts.relayUrl,
    passwordHash,
  })
}

export async function joinSession(opts: JoinSessionOptions): Promise<SessionHandle> {
  const resolved = await resolveRoom(opts.relayUrl, opts.roomCode)

  let passwordHash: string | undefined
  if (resolved.accessMode === 'password') {
    if (!opts.password) {
      throw new Error('Room requires a password')
    }
    passwordHash = await hashPassword(opts.password, resolved.uuid)
  }

  const doc = new Y.Doc()
  const awareness = new Awareness(doc)

  joinDoc(doc, {
    participantId: opts.participantId,
    displayName: opts.displayName,
  })

  awareness.setLocalStateField('participantId', opts.participantId)

  return wireSession({
    doc,
    awareness,
    roomCode: opts.roomCode,
    roomUuid: resolved.uuid,
    participantId: opts.participantId,
    relayUrl: opts.relayUrl,
    passwordHash,
    onRejection: opts.onRejection,
  })
}

export interface WireOptions {
  doc: Y.Doc
  awareness: Awareness
  roomCode: string
  roomUuid: string
  participantId: string
  relayUrl: string
  passwordHash?: string
  onRejection?: (reason: JoinRejectionReason) => void
}

export function wireSession(opts: WireOptions): SessionHandle {
  const { doc, awareness, participantId, relayUrl, roomUuid } = opts

  const statusCallbacks = new Set<(status: SyncStatus) => void>()
  const changeCallbacks = new Set<() => void>()
  const hostChangeCallbacks = new Set<(newHostId: string) => void>()

  // Connect to relay
  const conn: SyncConnection = connect({
    wsBaseUrl: opts.relayUrl,
    roomUuid: opts.roomUuid,
    doc,
    deviceId: participantId,
    passwordHash: opts.passwordHash,
    awareness,
    onStatusChange(status) {
      statusCallbacks.forEach((cb) => cb(status))
    },
    onRejection(reason) {
      console.error(`Connection rejected: ${reason}`)
      opts.onRejection?.(reason)
    },
  })

  // Wire host election
  const election: ElectionHandle = startElection(doc, awareness, participantId)

  // Observe doc changes
  const observeHandler = (): void => {
    changeCallbacks.forEach((cb) => cb())
  }
  doc.getMap('meta').observeDeep(observeHandler)
  doc.getMap('settings').observeDeep(observeHandler)
  doc.getMap('participants').observeDeep(observeHandler)
  doc.getArray('rounds').observeDeep(observeHandler)

  function getOnlineIds(): Set<string> {
    const ids = new Set<string>()
    awareness.getStates().forEach((state) => {
      const pid = (state as Record<string, unknown>)['participantId']
      if (typeof pid === 'string') ids.add(pid)
    })
    return ids
  }

  // Unanimous auto-reveal: if all online voters have voted, reveal automatically.
  // Viewers (role='viewer') are excluded from the count (ADR-0018, ADR-0020).
  const revealedByAuto = new Set<string>()
  const autoRevealInterval = setInterval(() => {
    const projection = projectDoc(doc)
    const round = currentRound(projection)
    if (!round || round.revealedAt !== undefined) return
    if (revealedByAuto.has(round.id)) return

    const onlineIds = getOnlineIds()
    if (onlineIds.size === 0) return

    // Only voters count toward unanimous reveal
    const onlineVoters = projection.participants.filter(
      (p) => onlineIds.has(p.id) && participantRole(p) === 'voter',
    )
    if (onlineVoters.length === 0) return

    const votedOnlineVoterCount = onlineVoters.filter((p) => p.id in round.votes).length
    if (votedOnlineVoterCount >= onlineVoters.length) {
      revealedByAuto.add(round.id)
      revealRoundMutation(doc, round.id, Date.now())
    }
  }, 250)

  // Track host changes: record initial value, fire callback only on actual changes
  let lastHostId = doc.getMap('settings').get('hostParticipantId') as string | undefined
  const hostChangeHandler = (): void => {
    const currentHostId = doc.getMap('settings').get('hostParticipantId') as string | undefined
    if (currentHostId !== lastHostId && currentHostId !== undefined) {
      hostChangeCallbacks.forEach((cb) => cb(currentHostId))
    }
    lastHostId = currentHostId
  }
  doc.getMap('settings').observe(hostChangeHandler)

  let disposed = false

  return {
    doc,
    awareness,
    roomCode: opts.roomCode,
    roomUuid: opts.roomUuid,

    projection() {
      return projectDoc(doc)
    },

    current() {
      return currentRound(projectDoc(doc))
    },

    isHost() {
      const p = projectDoc(doc)
      return p.settings.hostParticipantId === participantId
    },

    onlineIds: getOnlineIds,

    vote(card: string) {
      const round = currentRound(projectDoc(doc))
      if (round) castVote(doc, round.id, participantId, card)
    },

    unvote() {
      const round = currentRound(projectDoc(doc))
      if (round) clearVote(doc, round.id, participantId)
    },

    reveal() {
      const round = currentRound(projectDoc(doc))
      if (round) revealRoundMutation(doc, round.id, Date.now())
    },

    newRound(title?: string) {
      const id = randomUUID()
      appendRound(doc, {
        id,
        createdAt: Date.now(),
        createdBy: participantId,
        title,
      })
      return id
    },

    revote() {
      const round = currentRound(projectDoc(doc))
      const id = randomUUID()
      appendRound(doc, {
        id,
        createdAt: Date.now(),
        createdBy: participantId,
        parentRoundId: round?.id,
        title: round?.title,
      })
      return id
    },

    updateName(name: string | undefined) {
      patchSettings(doc, { name })
    },

    updateScale(scale: Scale) {
      patchSettings(doc, { defaultScale: scale })
    },

    updateDisplayName(name: string) {
      const projection = projectDoc(doc)
      const participant = projection.participants.find((p) => p.id === participantId)
      const joinedAt = participant?.joinedAt ?? Date.now()
      upsertParticipant(doc, participantId, { displayName: name, joinedAt })
    },

    async updateAccess(mode: 'open' | 'password', password?: string) {
      let passwordHash: string | null = null
      if (mode === 'password') {
        if (!password) throw new Error('Password required for password mode')
        passwordHash = await hashPassword(password, roomUuid)
      }
      await patchRoomAccess(relayUrl, roomUuid, passwordHash)
      // Update stored credentials so reconnect uses new passwordHash
      conn.updateCredentials({ passwordHash })
    },

    handoffHost(targetId: string) {
      if (!this.isHost()) {
        throw new Error('Only the current host can hand off')
      }
      const onlineIds = getOnlineIds()
      if (!onlineIds.has(targetId)) {
        throw new Error('Target participant is not online')
      }
      const projection = projectDoc(doc)
      const targetExists = projection.participants.some((p) => p.id === targetId)
      if (!targetExists) {
        throw new Error('Target participant does not exist')
      }
      patchSettings(doc, { hostParticipantId: targetId })
    },

    toggleRole() {
      const projection = projectDoc(doc)
      const participant = projection.participants.find((p) => p.id === participantId)
      const currentRoleValue = participantRole(participant ?? {})
      const newRole: 'voter' | 'viewer' = currentRoleValue === 'viewer' ? 'voter' : 'viewer'
      const joinedAt = participant?.joinedAt ?? Date.now()
      upsertParticipant(doc, participantId, {
        displayName: participant?.displayName ?? '',
        joinedAt,
        role: newRole,
      })
    },

    onChange(cb: () => void) {
      changeCallbacks.add(cb)
      return () => changeCallbacks.delete(cb)
    },

    onStatusChange(cb: (status: SyncStatus) => void) {
      statusCallbacks.add(cb)
      return () => statusCallbacks.delete(cb)
    },

    onHostChange(cb: (newHostId: string) => void) {
      hostChangeCallbacks.add(cb)
      return () => hostChangeCallbacks.delete(cb)
    },

    disconnect() {
      if (disposed) return
      disposed = true
      clearInterval(autoRevealInterval)
      election.stop()
      doc.getMap('meta').unobserveDeep(observeHandler)
      doc.getMap('settings').unobserveDeep(observeHandler)
      doc.getMap('settings').unobserve(hostChangeHandler)
      doc.getMap('participants').unobserveDeep(observeHandler)
      doc.getArray('rounds').unobserveDeep(observeHandler)
      conn.disconnect()
    },
  }
}
