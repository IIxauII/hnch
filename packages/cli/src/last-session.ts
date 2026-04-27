/**
 * Last session cache stored at `~/.config/hnch/last-session.json`.
 *
 * Caches the most recent room code, UUID, and timestamp to enable
 * quick session resumption. Entries older than 24 hours are discarded.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LastSessionCache } from '@hnch/shared'
import { configDir } from './config.js'

export interface CliLastSessionCache extends LastSessionCache {
  readonly passwordHash?: string
}

const SESSION_TTL = 24 * 60 * 60 * 1000 // 24h in ms

function lastSessionPath(): string {
  return join(configDir(), 'last-session.json')
}

function isValidLastSessionCache(obj: unknown): obj is CliLastSessionCache {
  if (typeof obj !== 'object' || obj === null) return false
  const cache = obj as Record<string, unknown>
  return (
    typeof cache['roomCode'] === 'string' &&
    typeof cache['roomUuid'] === 'string' &&
    typeof cache['lastSeenAt'] === 'number' &&
    (cache['passwordHash'] === undefined || typeof cache['passwordHash'] === 'string')
  )
}

export function readLastSession(): CliLastSessionCache | null {
  const path = lastSessionPath()
  if (!existsSync(path)) return null

  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))

    if (!isValidLastSessionCache(data)) {
      clearLastSession()
      return null
    }

    // Check TTL
    if (Date.now() - data.lastSeenAt > SESSION_TTL) {
      clearLastSession()
      return null
    }

    return data
  } catch {
    clearLastSession()
    return null
  }
}

export function writeLastSession(cache: CliLastSessionCache): void {
  const dir = configDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const path = lastSessionPath()
  writeFileSync(path, JSON.stringify(cache, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
  chmodSync(path, 0o600)
}

export function clearLastSession(): void {
  const path = lastSessionPath()
  try {
    unlinkSync(path)
  } catch (err) {
    // Swallow ENOENT
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
  }
}
