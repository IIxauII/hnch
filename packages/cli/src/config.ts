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

export interface CliConfig {
  participantId: string
  displayName: string
  relayUrl: string
}

const DEFAULT_RELAY_URL = 'http://localhost:1234'

function configDir(): string {
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

export function writeConfig(config: Partial<CliConfig>): void {
  ensureDir()
  const existing = readConfig()
  const merged = { ...existing, ...config }
  writeFileSync(configPath(), JSON.stringify(merged, null, 2) + '\n', 'utf-8')
}

async function promptLine(question: string): Promise<string> {
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

  // Env override for relay URL
  const relayUrl = process.env['HNCH_RELAY_URL'] || stored.relayUrl!

  return {
    participantId: stored.participantId!,
    displayName: stored.displayName!,
    relayUrl,
  }
}

/**
 * Update specific config fields (used by `hnch config` subcommand).
 */
export function updateConfig(patch: Partial<Pick<CliConfig, 'displayName' | 'relayUrl'>>): void {
  writeConfig(patch)
}
