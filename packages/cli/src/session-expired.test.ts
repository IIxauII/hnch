import { describe, it, expect, vi } from 'vitest'
import { onSessionExpired } from './session-expired.js'

function makeDeps(overrides?: { clearLastSession?: () => Promise<void> | void }) {
  const callOrder: string[] = []

  const clearLastSession = vi.fn(
    overrides?.clearLastSession ??
      (async () => {
        callOrder.push('clear')
      }),
  )
  const logger = {
    error: vi.fn((msg: string) => {
      callOrder.push('log:' + msg)
    }),
  }
  const exit = vi.fn((_code: number): never => {
    callOrder.push('exit')
    return undefined as never
  })

  return { clearLastSession, logger, exit, callOrder }
}

describe('onSessionExpired', () => {
  it('clears cache before logging', async () => {
    const { clearLastSession, logger, exit, callOrder } = makeDeps()
    await onSessionExpired({ clearLastSession, logger, exit })

    expect(clearLastSession).toHaveBeenCalledOnce()
    expect(callOrder.indexOf('clear')).toBeLessThan(callOrder.findIndex((e) => e.startsWith('log:')))
  })

  it('logs message distinct from wrong-password and room-full strings', async () => {
    const { clearLastSession, logger, exit } = makeDeps()
    await onSessionExpired({ clearLastSession, logger, exit })

    const msgs = logger.error.mock.calls.map((c) => c[0] as string)
    expect(msgs.length).toBeGreaterThan(0)
    for (const msg of msgs) {
      expect(msg).not.toContain('wrong password')
      expect(msg).not.toContain('room is full')
      expect(msg).not.toContain('room-full')
      expect(msg).not.toContain('wrong-password')
    }
  })

  it('calls exit(1)', async () => {
    const { clearLastSession, logger, exit } = makeDeps()
    await onSessionExpired({ clearLastSession, logger, exit })

    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('exit called after clear and log', async () => {
    const { clearLastSession, logger, exit, callOrder } = makeDeps()
    await onSessionExpired({ clearLastSession, logger, exit })

    const clearIdx = callOrder.indexOf('clear')
    const logIdx = callOrder.findIndex((e) => e.startsWith('log:'))
    const exitIdx = callOrder.indexOf('exit')
    expect(clearIdx).toBeLessThan(exitIdx)
    expect(logIdx).toBeLessThan(exitIdx)
  })

  it('still calls exit(1) when clearLastSession throws', async () => {
    const { logger, exit, callOrder } = makeDeps()
    const throwingClear = vi.fn(async () => {
      throw new Error('EBUSY: resource busy')
    })
    await onSessionExpired({ clearLastSession: throwingClear, logger, exit })

    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(1)
    // logged the failure
    expect(logger.error).toHaveBeenCalled()
    const msgs = logger.error.mock.calls.map((c) => c[0] as string)
    expect(msgs.some((m) => m.includes('EBUSY'))).toBe(true)
    // exit still in call order
    expect(callOrder).toContain('exit')
  })

  it('logs manual-removal hint when clearLastSession throws', async () => {
    const { logger, exit } = makeDeps()
    const throwingClear = vi.fn(async () => {
      throw new Error('EPERM')
    })
    await onSessionExpired({ clearLastSession: throwingClear, logger, exit })

    const msgs = logger.error.mock.calls.map((c) => c[0] as string)
    expect(msgs.some((m) => m.includes('manually'))).toBe(true)
  })
})
