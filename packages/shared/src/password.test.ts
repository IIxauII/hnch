import { describe, it, expect } from 'vitest'
import { hashPassword } from './password.js'

describe('hashPassword', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await hashPassword('secret', 'room-uuid')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same inputs', async () => {
    const a = await hashPassword('secret', 'room-uuid')
    const b = await hashPassword('secret', 'room-uuid')
    expect(a).toBe(b)
  })

  it('produces different hashes for different passwords', async () => {
    const a = await hashPassword('alpha', 'room-uuid')
    const b = await hashPassword('bravo', 'room-uuid')
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different salts', async () => {
    const a = await hashPassword('secret', 'uuid-1')
    const b = await hashPassword('secret', 'uuid-2')
    expect(a).not.toBe(b)
  })

  it('handles empty password', async () => {
    const hash = await hashPassword('', 'room-uuid')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles empty salt', async () => {
    const hash = await hashPassword('secret', '')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
