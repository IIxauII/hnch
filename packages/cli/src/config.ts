/**
 * Persistent CLI config stored at `~/.config/hnch/config.json`.
 *
 * Holds the device identity (participantId and its device key), display
 * name, and relay URL. On first run, generates a stable participantId and
 * device key, and prompts for a display name via stdin.
 *
 * Respects `XDG_CONFIG_HOME` if set; otherwise falls back to
 * `~/.config`. `HNCH_RELAY_URL` env var overrides the stored relay URL.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import {
  deterministicAvatarColor,
  parseAvatarColor,
  type CustomScale,
  type PresetOverrides,
} from '@hnch/shared';

export interface CliConfig {
  participantId: string;
  /**
   * This device's secret (ADR-0059): 32 random bytes as 64 lowercase hex
   * chars, from which each room's participant key is derived. Generated once,
   * next to `participantId`, and never shown or logged.
   */
  deviceKey: string;
  displayName: string;
  relayUrl: string;
  defaultScale?: string | undefined;
  defaultSessionName?: string | undefined;
  defaultPassword?: boolean | undefined;
  presetOverrides?: PresetOverrides | undefined;
  customScales?: CustomScale[] | undefined;
  /**
   * Avatar color wire value (ADR-0043). `AccentKey` palette key or
   * `#rrggbb` hex literal. Auto-assigned deterministically from
   * `participantId` on first run; user-editable via `hnch config`.
   */
  avatarColor?: string | undefined;
}

// Production relay (http scheme for Node.js fetch; ws scheme derived in sync.ts).
// Override with HNCH_RELAY_URL env var or `hnch config --relay-url`.
const DEFAULT_RELAY_URL = 'https://hnch.dev';

const DEVICE_KEY_PATTERN = /^[0-9a-f]{64}$/;

export function configDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg || join(homedir(), '.config');
  return join(base, 'hnch');
}

function configPath(): string {
  return join(configDir(), 'config.json');
}

function ensureDir(): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * The file holds the device key, which proves this device to the relay
 * (ADR-0059): owner-only. `mode` applies only to a new file, so an older,
 * wider one is narrowed too.
 */
function writeConfigFile(config: Record<string, unknown>): void {
  const path = configPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readConfig(): Partial<CliConfig> {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Partial<CliConfig>;
  } catch {
    return {};
  }
}

/**
 * Merge `config` into the stored config file. Uses a shallow spread, so
 * nested objects (e.g. `presetOverrides`, `customScales`) are replaced
 * wholesale — pass the full updated value, not a partial nested patch.
 */
export function writeConfig(config: Partial<CliConfig>): void {
  ensureDir();
  const existing = readConfig();
  const merged = { ...existing, ...config };
  writeConfigFile(merged);
}

export async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Load config, generating missing fields. Prompts for displayName on
 * first run. Returns a fully-resolved config.
 */
function coerceRelayUrlToHttp(url: string): string {
  if (url.startsWith('wss://')) return 'https://' + url.slice(6);
  if (url.startsWith('ws://')) return 'http://' + url.slice(5);
  return url;
}

export async function loadConfig(): Promise<CliConfig> {
  const stored = readConfig();
  let changed = false;

  if (!stored.participantId) {
    stored.participantId = randomUUID();
    changed = true;
  }

  // Configs from before ADR-0059 have none. A malformed one derives no key, so
  // it is replaced too; one merely in upper case is kept, or this device would
  // lose its binding in every room.
  const lowered = stored.deviceKey?.toLowerCase();
  if (lowered !== stored.deviceKey && lowered !== undefined && DEVICE_KEY_PATTERN.test(lowered)) {
    stored.deviceKey = lowered;
    changed = true;
  }
  if (!stored.deviceKey || !DEVICE_KEY_PATTERN.test(stored.deviceKey)) {
    stored.deviceKey = randomBytes(32).toString('hex');
    changed = true;
  }

  if (!stored.displayName) {
    const name = await promptLine('Enter your display name: ');
    stored.displayName = name || `user-${stored.participantId.slice(0, 6)}`;
    changed = true;
  }

  if (!stored.relayUrl) {
    stored.relayUrl = DEFAULT_RELAY_URL;
    changed = true;
  }

  // Avatar color (ADR-0043): if absent or malformed, seed deterministically
  // from the participantId so the color is stable from first launch onward.
  if (!stored.avatarColor || parseAvatarColor(stored.avatarColor) === null) {
    stored.avatarColor = deterministicAvatarColor(stored.participantId!);
    changed = true;
  }

  if (changed) {
    writeConfig(stored);
  }

  // Env override for relay URL; coerce stale ws:// / wss:// schemes to http(s)
  let relayUrl = process.env['HNCH_RELAY_URL'] || stored.relayUrl!;
  relayUrl = coerceRelayUrlToHttp(relayUrl);

  return {
    participantId: stored.participantId!,
    deviceKey: stored.deviceKey,
    displayName: stored.displayName!,
    relayUrl,
    defaultScale: stored.defaultScale,
    defaultSessionName: stored.defaultSessionName,
    defaultPassword: stored.defaultPassword,
    presetOverrides: stored.presetOverrides,
    customScales: stored.customScales,
    avatarColor: stored.avatarColor,
  };
}

/** Who this device is in a session, and which relay it talks to. */
export type ParticipantOptions = Pick<
  CliConfig,
  'relayUrl' | 'participantId' | 'deviceKey' | 'displayName'
>;

/**
 * The fields every session open takes from the config. `avatarColor` is left
 * out: a join writes it over the participant's color in the doc, so only the
 * interactive commands pass it, on their own.
 */
export function participantOptions(config: CliConfig): ParticipantOptions {
  return {
    relayUrl: config.relayUrl,
    participantId: config.participantId,
    deviceKey: config.deviceKey,
    displayName: config.displayName,
  };
}

/**
 * Update specific config fields (used by `hnch config` subcommand).
 * String fields set to empty string are deleted from config.
 */
export function updateConfig(patch: Partial<CliConfig>): void {
  ensureDir();
  const existing = readConfig();
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === '') {
      delete merged[key];
    } else if (value !== undefined) {
      merged[key] = value;
    }
  }
  writeConfigFile(merged);
}
