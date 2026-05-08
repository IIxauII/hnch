/**
 * Tests for `logBootBanner` per ADR-0027 §6.
 *
 * The relay must emit exactly ONE structured boot log line declaring the
 * effective `roomCap` and `testRoutesEnabled`. INFO normally; WARN when in
 * a non-production state (`roomCap < MAX_ROOM_PARTICIPANTS` OR
 * `testRoutesEnabled === true`).
 */

import { describe, expect, it, vi } from 'vitest'
import { MAX_ROOM_PARTICIPANTS } from '@hnch/shared'
import { logBootBanner } from './server.js'

function makeLogger(): { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } {
  return { log: vi.fn(), warn: vi.fn() }
}

describe('logBootBanner (ADR-0027 §6)', () => {
  it('production config (roomCap=MAX, testRoutes=false) → INFO, single line', () => {
    const logger = makeLogger()
    logBootBanner({
      port: 1234,
      host: '0.0.0.0',
      roomCap: MAX_ROOM_PARTICIPANTS,
      testRoutesEnabled: false,
      logger,
    })
    expect(logger.log).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
    const msg = logger.log.mock.calls[0]![0] as string
    expect(msg).toContain('0.0.0.0:1234')
    expect(msg).toContain(`roomCap=${MAX_ROOM_PARTICIPANTS}`)
    expect(msg).toContain('testRoutes=false')
  })

  it('lowered cap (roomCap<MAX, testRoutes=false) → WARN, single line', () => {
    const logger = makeLogger()
    logBootBanner({ port: 1234, host: '0.0.0.0', roomCap: 3, testRoutesEnabled: false, logger })
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.log).not.toHaveBeenCalled()
    const msg = logger.warn.mock.calls[0]![0] as string
    expect(msg).toContain('0.0.0.0:1234')
    expect(msg).toContain('roomCap=3')
    expect(msg).toContain('testRoutes=false')
  })

  it('test-routes on (roomCap=MAX, testRoutes=true) → WARN, single line', () => {
    const logger = makeLogger()
    logBootBanner({
      port: 1234,
      host: '0.0.0.0',
      roomCap: MAX_ROOM_PARTICIPANTS,
      testRoutesEnabled: true,
      logger,
    })
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.log).not.toHaveBeenCalled()
    const msg = logger.warn.mock.calls[0]![0] as string
    expect(msg).toContain('0.0.0.0:1234')
    expect(msg).toContain(`roomCap=${MAX_ROOM_PARTICIPANTS}`)
    expect(msg).toContain('testRoutes=true')
  })

  it('both non-prod (roomCap<MAX, testRoutes=true) → WARN, single line', () => {
    const logger = makeLogger()
    logBootBanner({ port: 1234, host: '0.0.0.0', roomCap: 3, testRoutesEnabled: true, logger })
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.log).not.toHaveBeenCalled()
    const msg = logger.warn.mock.calls[0]![0] as string
    expect(msg).toContain('0.0.0.0:1234')
    expect(msg).toContain('roomCap=3')
    expect(msg).toContain('testRoutes=true')
  })

  it('emits ONE line total per call across all four configs', () => {
    const configs: ReadonlyArray<{ roomCap: number; testRoutesEnabled: boolean }> = [
      { roomCap: MAX_ROOM_PARTICIPANTS, testRoutesEnabled: false },
      { roomCap: 3, testRoutesEnabled: false },
      { roomCap: MAX_ROOM_PARTICIPANTS, testRoutesEnabled: true },
      { roomCap: 3, testRoutesEnabled: true },
    ]
    for (const cfg of configs) {
      const logger = makeLogger()
      logBootBanner({ port: 1234, host: '0.0.0.0', logger, ...cfg })
      expect(logger.log.mock.calls.length + logger.warn.mock.calls.length).toBe(1)
    }
  })
})
