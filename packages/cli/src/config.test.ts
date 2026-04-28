import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (ans: string) => void) => cb('TestUser')),
    close: vi.fn(),
  })),
}))

import {
  configDir,
  readConfig,
  writeConfig,
  updateConfig,
  loadConfig,
  type CliConfig,
} from './config.js'

let tmpBase: string

beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), 'hnch-config-test-'))
  process.env['XDG_CONFIG_HOME'] = tmpBase
})

afterEach(() => {
  delete process.env['XDG_CONFIG_HOME']
  delete process.env['HNCH_RELAY_URL']
  rmSync(tmpBase, { recursive: true, force: true })
})

describe('configDir', () => {
  it('returns <tmpBase>/hnch when XDG_CONFIG_HOME set', () => {
    expect(configDir()).toBe(join(tmpBase, 'hnch'))
  })
})

describe('readConfig', () => {
  it('returns {} for missing file', () => {
    expect(readConfig()).toEqual({})
  })

  it('parses valid JSON', () => {
    writeConfig({ participantId: 'p1', displayName: 'Alice', relayUrl: 'http://localhost:1234' })
    const result = readConfig()
    expect(result.participantId).toBe('p1')
    expect(result.displayName).toBe('Alice')
  })

  it('returns {} for malformed JSON', () => {
    const dir = configDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.json'), 'not-valid-json', 'utf-8')
    expect(readConfig()).toEqual({})
  })
})

describe('writeConfig', () => {
  it('creates directory if missing', () => {
    writeConfig({ participantId: 'p1' })
    expect(existsSync(join(tmpBase, 'hnch', 'config.json'))).toBe(true)
  })

  it('writes parseable JSON', () => {
    writeConfig({ participantId: 'p1', displayName: 'Bob' })
    const raw = readFileSync(join(tmpBase, 'hnch', 'config.json'), 'utf-8')
    const parsed = JSON.parse(raw) as CliConfig
    expect(parsed.participantId).toBe('p1')
    expect(parsed.displayName).toBe('Bob')
  })

  it('shallow-merges into existing config', () => {
    writeConfig({ participantId: 'p1', displayName: 'Charlie' })
    writeConfig({ relayUrl: 'http://relay:9000' })
    const result = readConfig()
    expect(result.participantId).toBe('p1')
    expect(result.displayName).toBe('Charlie')
    expect(result.relayUrl).toBe('http://relay:9000')
  })

  it('overwrites same key', () => {
    writeConfig({ displayName: 'Old' })
    writeConfig({ displayName: 'New' })
    expect(readConfig().displayName).toBe('New')
  })
})

describe('updateConfig', () => {
  it('removes keys with empty-string values', () => {
    writeConfig({ displayName: 'Alice', relayUrl: 'http://localhost:1234' })
    updateConfig({ displayName: '' })
    const result = readConfig()
    expect(result).not.toHaveProperty('displayName')
    expect(result.relayUrl).toBe('http://localhost:1234')
  })

  it('ignores undefined values', () => {
    writeConfig({ displayName: 'Alice' })
    updateConfig({ displayName: undefined })
    expect(readConfig().displayName).toBe('Alice')
  })

  it('updates non-empty values', () => {
    writeConfig({ displayName: 'Alice' })
    updateConfig({ displayName: 'Bob' })
    expect(readConfig().displayName).toBe('Bob')
  })

  it('creates file if none exists', () => {
    updateConfig({ displayName: 'NewUser' })
    expect(readConfig().displayName).toBe('NewUser')
  })
})

describe('loadConfig', () => {
  it('returns existing config unchanged when all fields already present', async () => {
    writeConfig({ participantId: 'existing-id', displayName: 'Existing', relayUrl: 'http://custom:5678' })
    const result = await loadConfig()
    expect(result.participantId).toBe('existing-id')
    expect(result.displayName).toBe('Existing')
    expect(result.relayUrl).toBe('http://custom:5678')
  })

  it('generates participantId when missing', async () => {
    writeConfig({ displayName: 'Alice', relayUrl: 'http://localhost:1234' })
    const result = await loadConfig()
    expect(typeof result.participantId).toBe('string')
    expect(result.participantId.length).toBeGreaterThan(0)
  })

  it('sets DEFAULT_RELAY_URL when relayUrl missing', async () => {
    writeConfig({ participantId: 'p1', displayName: 'Alice' })
    const result = await loadConfig()
    expect(result.relayUrl).toBe('http://localhost:1234')
  })

  it('HNCH_RELAY_URL env var overrides stored relayUrl', async () => {
    writeConfig({ participantId: 'p1', displayName: 'Alice', relayUrl: 'http://stored:1234' })
    process.env['HNCH_RELAY_URL'] = 'http://override:9999'
    const result = await loadConfig()
    expect(result.relayUrl).toBe('http://override:9999')
  })

  it('prompts for displayName when missing and uses the prompt result', async () => {
    writeConfig({ participantId: 'p1', relayUrl: 'http://localhost:1234' })
    const result = await loadConfig()
    expect(result.displayName).toBe('TestUser')
  })
})
