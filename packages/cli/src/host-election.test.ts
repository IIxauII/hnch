import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import * as sharedDoc from '@hnch/shared'
import { DOC_SETTINGS_KEY } from '@hnch/shared'
import { startElection, HOST_ABSENCE_ELECTION_DEBOUNCE_MS } from './host-election.js'

function setAwarenessStates(awareness: Awareness, states: Record<number, string>): void {
  const statesMap = awareness.states as Map<number, unknown>
  statesMap.clear()
  for (const [clientId, participantId] of Object.entries(states)) {
    statesMap.set(Number(clientId), { participantId })
  }
  ;(awareness as unknown as { emit(name: string, args: unknown[]): void }).emit('change', [
    { added: [], updated: Object.keys(states).map(Number), removed: [] },
  ])
}

let doc: Y.Doc
let awareness: Awareness
let patchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  doc = new Y.Doc()
  awareness = new Awareness(doc)
  patchSpy = vi.spyOn(sharedDoc, 'patchSettings')
})

afterEach(() => {
  vi.useRealTimers()
  patchSpy.mockRestore()
  awareness.destroy()
  doc.destroy()
})

describe('startElection', () => {
  it('host present in awareness → no action after debounce', () => {
    doc.getMap(DOC_SETTINGS_KEY).set('hostParticipantId', 'host-1')
    const handle = startElection(doc, awareness, 'peer-1')
    setAwarenessStates(awareness, { 1: 'host-1', 2: 'peer-1' })
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(patchSpy).not.toHaveBeenCalled()
    handle.stop()
  })

  it('host absent from start, I am the lowest-ID → patchSettings called with my ID after debounce', () => {
    doc.getMap(DOC_SETTINGS_KEY).set('hostParticipantId', 'host-1')
    const handle = startElection(doc, awareness, 'aaa-lowest')
    setAwarenessStates(awareness, { 1: 'aaa-lowest', 2: 'bbb-other' })
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(patchSpy).toHaveBeenCalledWith(doc, { hostParticipantId: 'aaa-lowest' })
    handle.stop()
  })

  it('host absent from start, I am NOT the lowest-ID → no action after debounce', () => {
    doc.getMap(DOC_SETTINGS_KEY).set('hostParticipantId', 'host-1')
    const handle = startElection(doc, awareness, 'zzz-high')
    setAwarenessStates(awareness, { 1: 'aaa-lower', 2: 'zzz-high' })
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(patchSpy).not.toHaveBeenCalled()
    handle.stop()
  })

  it('host disappears mid-session → triggers debounce → promotion fires', () => {
    doc.getMap(DOC_SETTINGS_KEY).set('hostParticipantId', 'host-1')
    const handle = startElection(doc, awareness, 'peer-me')
    // Host present initially
    setAwarenessStates(awareness, { 1: 'host-1', 2: 'peer-me' })
    vi.advanceTimersByTime(1000)
    expect(patchSpy).not.toHaveBeenCalled()
    // Host disappears
    setAwarenessStates(awareness, { 2: 'peer-me' })
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(patchSpy).toHaveBeenCalledWith(doc, { hostParticipantId: 'peer-me' })
    handle.stop()
  })

  it('host rejoins before debounce fires → debounce cancelled, no promotion', () => {
    doc.getMap(DOC_SETTINGS_KEY).set('hostParticipantId', 'host-1')
    const handle = startElection(doc, awareness, 'peer-me')
    setAwarenessStates(awareness, { 2: 'peer-me' })
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS - 1000)
    // Host comes back
    setAwarenessStates(awareness, { 1: 'host-1', 2: 'peer-me' })
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(patchSpy).not.toHaveBeenCalled()
    handle.stop()
  })

  it('no hostParticipantId in doc → no action', () => {
    const handle = startElection(doc, awareness, 'peer-me')
    setAwarenessStates(awareness, { 1: 'peer-me' })
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(patchSpy).not.toHaveBeenCalled()
    handle.stop()
  })

  it('handle.stop() cleans up: debounce cancelled, no future evaluation', () => {
    doc.getMap(DOC_SETTINGS_KEY).set('hostParticipantId', 'host-1')
    const handle = startElection(doc, awareness, 'peer-me')
    setAwarenessStates(awareness, { 2: 'peer-me' })
    vi.advanceTimersByTime(1000)
    handle.stop()
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(patchSpy).not.toHaveBeenCalled()
    // Further awareness changes after stop don't trigger anything
    setAwarenessStates(awareness, { 2: 'peer-me', 3: 'zzz' })
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(patchSpy).not.toHaveBeenCalled()
  })
})
