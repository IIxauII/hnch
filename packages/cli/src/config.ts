/**
 * Persistent CLI config stored at `~/.config/hnch/config.json`.
 *
 * Holds the device identity (participantId), display name, and relay
 * URL. On first run, generates a stable participantId and prompts for
 * a display name via stdin.
 *
 * Respects `XDG_CONFIG_HOME` if set; otherwise falls back to
 * `~/.config`. `HNCH_RELAY_URL` env var overrides the stored relay URL.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { PresetOverrides, CustomScale } from '@hnch/shared'

export interface CliConfig {
  participantId: string
  displayName: string
  relayUrl: string
  defaultScale?: string
  defaultSessionName?: string
  defaultPassword?: boolean
  presetOverrides?: PresetOverrides
  customScales?: CustomScale[]
}

// Production relay (http scheme for Node.js fetch; ws scheme derived in sync.ts).
// Override with HNCH_RELAY_URL env var or `hnch config --relay-url`.
const DEFAULT_RELAY_URL = 'https://hnch.dev'

export function configDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME']
  const base = xdg || join(homedir(), '.config')
  return join(base, 'hnch')
}

function configPath(): string {
  return join(configDir(), 'config.json')
}

function ensureDir(): void {
  const dir = configDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function readConfig(): Partial<CliConfig> {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Partial<CliConfig>
  } catch {
    return {}
  }
}

/**
 * Merge `config` into the stored config file. Uses a shallow spread, so
 * nested objects (e.g. `presetOverrides`, `customScales`) are replaced
 * wholesale — pass the full updated value, not a partial nested patch.
 */
export function writeConfig(config: Partial<CliConfig>): void {
  ensureDir()
  const existing = readConfig()
  const merged = { ...existing, ...config }
  writeFileSync(configPath(), JSON.stringify(merged, null, 2) + '\n', 'utf-8')
}

export async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * Load config, generating missing fields. Prompts for displayName on
 * first run. Returns a fully-resolved config.
 */
function coerceRelayUrlToHttp(url: string): string {
  if (url.startsWith('wss://')) return 'https://' + url.slice(6)
  if (url.startsWith('ws://')) return 'http://' + url.slice(5)
  return url
}

export async function loadConfig(): Promise<CliConfig> {
  const stored = readConfig()
  let changed = false

  if (!stored.participantId) {
    stored.participantId = randomUUID()
    changed = true
  }

  if (!stored.displayName) {
    const name = await promptLine('Enter your display name: ')
    stored.displayName = name || `user-${stored.participantId.slice(0, 6)}`
    changed = true
  }

  if (!stored.relayUrl) {
    stored.relayUrl = DEFAULT_RELAY_URL
    changed = true
  }

  if (changed) {
    writeConfig(stored)
  }

  // Env override for relay URL; coerce stale ws:// / wss:// schemes to http(s)
  let relayUrl = process.env['HNCH_RELAY_URL'] || stored.relayUrl!
  relayUrl = coerceRelayUrlToHttp(relayUrl)

  return {
    participantId: stored.participantId!,
    displayName: stored.displayName!,
    relayUrl,
    defaultScale: stored.defaultScale,
    defaultSessionName: stored.defaultSessionName,
    defaultPassword: stored.defaultPassword,
    presetOverrides: stored.presetOverrides,
    customScales: stored.customScales,
  }
}

/**
 * Update specific config fields (used by `hnch config` subcommand).
 * String fields set to empty string are deleted from config.
 */
export function updateConfig(patch: Partial<CliConfig>): void {
  ensureDir()
  const existing = readConfig()
  const merged: Record<string, unknown> = { ...existing }
  for (const [key, value] of Object.entries(patch)) {
    if (value === '') {
      delete merged[key]
    } else if (value !== undefined) {
      merged[key] = value
    }
  }
  writeFileSync(configPath(), JSON.stringify(merged, null, 2) + '\n', 'utf-8')
}
