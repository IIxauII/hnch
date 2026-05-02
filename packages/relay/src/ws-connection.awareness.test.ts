/**
 * Integration tests for y-websocket awareness forwarding.
 *
 * Covers the relay-side behaviour of `setupWSConnection` that the
 * doc-sync tests in ws-connection.test.ts do not exercise:
 *
 *   - Awareness updates from peer A are forwarded to peer B (and not
 *     echoed back to A).
 *   - When a new peer connects to a room that already has awareness
 *     states, the relay immediately pushes those states to the new peer.
 *   - When a peer disconnects, its awareness states are removed from
 *     the room's Awareness instance so later peers no longer see them.
 */

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import { createCodePool } from './code-pool.js'
import { createRoomStore, type RoomStore } from './room-store.js'
import { createRelayServer } from './server.js'

const messageSync = 0
const messageAwareness = 1

// ---------------------------------------------------------------------------
// Extended test peer — tracks received awareness updates
// ---------------------------------------------------------------------------

interface AwarenessPeer {
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  socket: WebSocket
  /**
   * Count of remote-origin awareness changes observed by this peer's
   * awareness instance (i.e. changes that came from the relay, not from
   * this peer itself setting local state).
   */
  remoteAwarenessChangeCount: number
  /** Resolves once the server delivers sync-step-2 (initial sync done). */
  whenSynced: Promise<void>
  /** Set own awareness state (fires an awareness message to the relay). */
  setLocalState(state: Record<string, unknown>): void
  close(): Promise<void>
}

function connectAwarenessPeer(baseWsUrl: string, uuid: string): Promise<AwarenessPeer> {
  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  let remoteAwarenessChangeCount = 0
  const socket = new WebSocket(`${baseWsUrl}/ws/${uuid}?did=device-${Math.random()}`)
  socket.binaryType = 'arraybuffer'

  let markSynced: () => void = () => {}
  const whenSynced = new Promise<void>((resolve) => { markSynced = resolve })

  socket.on('message', (data) => {
    const buf =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : Array.isArray(data)
          ? new Uint8Array(Buffer.concat(data as readonly Uint8Array[]))
          : new Uint8Array(data as Buffer)
    const decoder = decoding.createDecoder(buf)
    const messageType = decoding.readVarUint(decoder)
    switch (messageType) {
      case messageSync: {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        const syncType = syncProtocol.readSyncMessage(decoder, encoder, doc, socket)
        if (encoding.length(encoder) > 1) socket.send(encoding.toUint8Array(encoder))
        if (syncType === syncProtocol.messageYjsSyncStep2) markSynced()
        break
      }
      case messageAwareness: {
        const update = decoding.readVarUint8Array(decoder)
        awarenessProtocol.applyAwarenessUpdate(awareness, update, socket)
        break
      }
    }
  })

  // Count remote-origin awareness changes (any change where origin !== 'local')
  awareness.on(
    'change',
    (_changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin !== 'local') {
        remoteAwarenessChangeCount++
      }
    },
  )

  // Forward local doc updates to the server
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === socket) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeUpdate(encoder, update)
    socket.send(encoding.toUint8Array(encoder))
  })

  // Forward local awareness changes to the server
  awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin !== 'local') return
      const changedIds = [...added, ...updated, ...removed]
      if (changedIds.length === 0) return
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageAwareness)
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedIds),
      )
      if (socket.readyState === socket.OPEN) {
        socket.send(encoding.toUint8Array(encoder))
      }
    },
  )

  const opened = new Promise<void>((resolve, reject) => {
    socket.once('open', () => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageSync)
      syncProtocol.writeSyncStep1(encoder, doc)
      socket.send(encoding.toUint8Array(encoder))
      resolve()
    })
    socket.once('error', reject)
  })

  const peer: AwarenessPeer = {
    doc,
    awareness,
    socket,
    get remoteAwarenessChangeCount() {
      return remoteAwarenessChangeCount
    },
    whenSynced,
    setLocalState(state: Record<string, unknown>): void {
      awareness.setLocalState(state)
    },
    async close(): Promise<void> {
      if (socket.readyState === socket.CLOSED) return
      await new Promise<void>((resolve) => {
        socket.once('close', () => resolve())
        socket.close()
      })
    },
  }

  return opened.then(() => peer)
}

async function waitFor(
  cond: () => boolean,
  { timeoutMs = 2_000, pollMs = 10 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (cond()) return
    await new Promise((r) => setTimeout(r, pollMs))
  }
  throw new Error('waitFor: condition not met within timeout')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('relay ws-connection awareness forwarding', () => {
  let server: Server
  let baseHttpUrl: string
  let baseWsUrl: string
  let roomStore: RoomStore

  beforeEach(async () => {
    roomStore = createRoomStore(createCodePool())
    server = createRelayServer({ roomStore })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address() as AddressInfo
    baseHttpUrl = `http://127.0.0.1:${address.port}`
    baseWsUrl = `ws://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('forwards awareness updates from peer A to peer B', async () => {
    const createRes = await fetch(`${baseHttpUrl}/rooms`, { method: 'POST' })
    const { uuid } = (await createRes.json()) as { uuid: string }

    const a = await connectAwarenessPeer(baseWsUrl, uuid)
    const b = await connectAwarenessPeer(baseWsUrl, uuid)
    await Promise.all([a.whenSynced, b.whenSynced])

    const aClientId = a.awareness.clientID
    a.setLocalState({ name: 'Alice', status: 'voting' })

    // Relay should forward A's state to B.
    await waitFor(() => b.awareness.getStates().has(aClientId))
    expect(b.awareness.getStates().get(aClientId)).toMatchObject({ name: 'Alice', status: 'voting' })

    await a.close()
    await b.close()
  }, 10_000)

  it("does not echo A's own awareness update back to A (relay forwards to B only)", async () => {
    const createRes = await fetch(`${baseHttpUrl}/rooms`, { method: 'POST' })
    const { uuid } = (await createRes.json()) as { uuid: string }

    const a = await connectAwarenessPeer(baseWsUrl, uuid)
    const b = await connectAwarenessPeer(baseWsUrl, uuid)
    await Promise.all([a.whenSynced, b.whenSynced])

    // A sets its state. The relay must forward it to B but NOT echo it back to A.
    const countBeforeA = a.remoteAwarenessChangeCount
    const aClientId = a.awareness.clientID
    a.setLocalState({ name: 'Alice' })

    // Wait for B to receive A's state — this confirms the relay processed the
    // update (otherwise A's echo could arrive "in flight" after the assertion).
    await waitFor(() => b.awareness.getStates().has(aClientId))

    expect(a.remoteAwarenessChangeCount).toBe(countBeforeA)

    await a.close()
    await b.close()
  }, 10_000)

  it('pushes existing awareness states to a newly connected peer', async () => {
    const createRes = await fetch(`${baseHttpUrl}/rooms`, { method: 'POST' })
    const { uuid } = (await createRes.json()) as { uuid: string }

    const a = await connectAwarenessPeer(baseWsUrl, uuid)
    await a.whenSynced

    const aClientId = a.awareness.clientID
    a.setLocalState({ name: 'Alice', cursor: 42 })

    // Wait until the relay's room awareness carries A's specific state (not just
    // the relay's own default state from the Awareness constructor).
    const room = roomStore.getByUuid(uuid)!
    await waitFor(() => room.awareness.getStates().has(aClientId))

    // B joins after A has already set state — relay should push it immediately.
    const b = await connectAwarenessPeer(baseWsUrl, uuid)
    await b.whenSynced

    await waitFor(() => b.awareness.getStates().has(aClientId))
    expect(b.awareness.getStates().get(aClientId)).toMatchObject({ name: 'Alice', cursor: 42 })

    await a.close()
    await b.close()
  }, 10_000)

  it("removes a disconnected peer's awareness states from the room", async () => {
    const createRes = await fetch(`${baseHttpUrl}/rooms`, { method: 'POST' })
    const { uuid } = (await createRes.json()) as { uuid: string }

    const a = await connectAwarenessPeer(baseWsUrl, uuid)
    await a.whenSynced

    const aClientId = a.awareness.clientID
    a.setLocalState({ name: 'Alice' })

    const room = roomStore.getByUuid(uuid)!
    // Wait for A's specific state (not the relay's own default {} state).
    await waitFor(() => room.awareness.getStates().has(aClientId))
    expect(room.awareness.getStates().has(aClientId)).toBe(true)

    await a.close()

    // After A disconnects the relay should clean up A's awareness state.
    await waitFor(() => !room.awareness.getStates().has(aClientId))
    expect(room.awareness.getStates().has(aClientId)).toBe(false)
  }, 10_000)
})
