import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CliLastSessionCache } from './last-session.js'
import { writeLastSession, readLastSession, clearLastSession } from './last-session.js'

const SAMPLE: CliLastSessionCache = {
  roomCode: 'ABC123',
  roomUuid: '00000000-0000-0000-0000-000000000000',
  lastSeenAt: Date.now(),
  passwordHash: 'secret-hash',
}

let tmpBase: string

beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), 'hnch-test-'))
  process.env['XDG_CONFIG_HOME'] = tmpBase
})

afterEach(() => {
  delete process.env['XDG_CONFIG_HOME']
  rmSync(tmpBase, { recursive: true, force: true })
})

describe('writeLastSession file permissions', () => {
  it('writes file with mode 0600', () => {
    writeLastSession(SAMPLE)
    const filePath = join(tmpBase, 'hnch', 'last-session.json')
    const st = statSync(filePath)
    if (process.platform !== 'win32') {
      expect(st.mode & 0o777).toBe(0o600)
    }
  })

  it('creates parent dir with mode 0700', () => {
    writeLastSession(SAMPLE)
    const dirPath = join(tmpBase, 'hnch')
    const st = statSync(dirPath)
    if (process.platform !== 'win32') {
      expect(st.mode & 0o777).toBe(0o700)
    }
  })

  it('resets mode to 0600 when overwriting a 0644 file', () => {
    // Pre-create with permissive mode
    writeLastSession(SAMPLE)
    const filePath = join(tmpBase, 'hnch', 'last-session.json')
    writeFileSync(filePath, '', { mode: 0o644 })

    writeLastSession(SAMPLE)
    const st = statSync(filePath)
    if (process.platform !== 'win32') {
      expect(st.mode & 0o777).toBe(0o600)
    }
  })
})

describe('readLastSession / clearLastSession round-trip', () => {
  it('returns null when no file exists', () => {
    expect(readLastSession()).toBeNull()
  })

  it('returns written cache', () => {
    writeLastSession(SAMPLE)
    const result = readLastSession()
    expect(result).not.toBeNull()
    expect(result?.roomCode).toBe('ABC123')
    expect(result?.passwordHash).toBe('secret-hash')
  })

  it('clears cache', () => {
    writeLastSession(SAMPLE)
    clearLastSession()
    expect(readLastSession()).toBeNull()
  })
})
