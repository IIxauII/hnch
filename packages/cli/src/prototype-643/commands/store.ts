/**
 * PROTOTYPE (#643). The simulated on-disk state: Recent rooms (the resume cache),
 * the fake relay's room directory, saved story lists, and config. It all lives in
 * one throwaway folder under the OS temp dir; `hnch proto reset` deletes it.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Story } from '../room-model.js';

export const STORE_DIR = join(tmpdir(), 'hnch-proto-643-wipe-me');

function path(file: string): string {
  return join(STORE_DIR, file);
}

function read<T>(file: string, fallback: () => T): T {
  try {
    if (existsSync(path(file))) return JSON.parse(readFileSync(path(file), 'utf8')) as T;
  } catch {
    // a corrupt prototype file is just reseeded
  }
  const v = fallback();
  write(file, v);
  return v;
}

function write(file: string, value: unknown): void {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(path(file), `${JSON.stringify(value, null, 2)}\n`);
}

export function resetStore(): void {
  rmSync(STORE_DIR, { recursive: true, force: true });
}

// ── Fake relay: which rooms exist ─────────────────────────────────────────

export interface FakeRoom {
  code: string; // 'K7P-9MR'
  name: string;
  /** The prototype's password, printed as a hint so the owner can try it. */
  password?: string | undefined;
  hostName: string;
  here: number;
}

const SEED_ROOMS: FakeRoom[] = [
  { code: 'K7P-9MR', name: 'Sprint 42', hostName: 'Hana', here: 5 },
  { code: 'Q2M-4TT', name: 'Retro', password: 'retro42', hostName: 'Hana', here: 4 },
];

export function rooms(): FakeRoom[] {
  return read('rooms.json', () => SEED_ROOMS);
}

export function findRoom(code: string): FakeRoom | undefined {
  return rooms().find((r) => r.code === code);
}

export function addRoom(r: FakeRoom): void {
  write('rooms.json', [...rooms().filter((x) => x.code !== r.code), r]);
}

// ── Recent rooms: the resume cache (UX-009, UX-087) ───────────────────────

export interface RecentEntry {
  code: string;
  name: string;
  lastSeenAt: number;
  /** A cached password hash: resume skips the prompt (UX-031, ADR-0044). */
  passwordHash?: boolean | undefined;
  /** Who you were in it (prototype: the --as person). */
  as: string;
}

export function recent(): RecentEntry[] {
  const now = Date.now();
  return read<RecentEntry[]>('recent.json', () => [
    { code: 'K7P-9MR', name: 'Sprint 42', lastSeenAt: now - 5 * 60_000, as: 'hana' },
    {
      code: 'Q2M-4TT',
      name: 'Retro',
      lastSeenAt: now - 26 * 3600_000,
      passwordHash: true,
      as: 'hana',
    },
  ]).toSorted((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function rememberRoom(e: RecentEntry): void {
  write('recent.json', [e, ...recent().filter((x) => x.code !== e.code)].slice(0, 5));
}

/** Forget one room, never the others (UX-009: today every exit wipes all five). */
export function forgetRoom(code: string): void {
  write(
    'recent.json',
    recent().filter((x) => x.code !== code),
  );
}

export function relTime(at: number, now = Date.now()): string {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ── Saved stories per room (so agenda one-shots and resume agree) ─────────

export function savedStories(code: string): Story[] | undefined {
  const all = read<Record<string, Story[]>>('stories.json', () => ({}));
  return all[code];
}

export function saveStories(code: string, stories: Story[]): void {
  const all = read<Record<string, Story[]>>('stories.json', () => ({}));
  all[code] = stories;
  write('stories.json', all);
}

// ── Config: local (this folder) over global (UX-102) ──────────────────────

export interface ProtoConfig {
  name?: string | undefined;
  color?: string | undefined;
  scale?: string | undefined;
  relayUrl?: string | undefined;
}

interface ConfigFile {
  global: ProtoConfig;
  local: Record<string, ProtoConfig>;
}

function configFile(): ConfigFile {
  return read<ConfigFile>('config.json', () => ({ global: {}, local: {} }));
}

export function readConfig(scope: 'global' | 'local', cwd = process.cwd()): ProtoConfig {
  const f = configFile();
  return scope === 'global' ? f.global : (f.local[cwd] ?? {});
}

export function writeConfig(scope: 'global' | 'local', patch: ProtoConfig, cwd = process.cwd()) {
  const f = configFile();
  if (scope === 'global') f.global = { ...f.global, ...patch };
  else f.local[cwd] = { ...f.local[cwd], ...patch };
  write('config.json', f);
}

export const DEFAULT_RELAY = 'https://hnch.dev';

/** The value in effect and where it comes from, so `hnch config` can say "(overridden by …)". */
export function effectiveConfig(env = process.env): {
  [K in keyof Required<ProtoConfig>]: { value: string | undefined; source: string };
} {
  const g = readConfig('global');
  const l = readConfig('local');
  const pick = (k: keyof ProtoConfig, dflt?: string) =>
    l[k] !== undefined
      ? { value: l[k], source: 'local (this folder)' }
      : g[k] !== undefined
        ? { value: g[k], source: 'global' }
        : { value: dflt, source: 'default' };
  const relay = env['HNCH_RELAY_URL']
    ? { value: env['HNCH_RELAY_URL'], source: 'overridden by HNCH_RELAY_URL' }
    : pick('relayUrl', DEFAULT_RELAY);
  return {
    name: pick('name'),
    color: pick('color', 'auto'),
    scale: pick('scale', 'fibonacci'),
    relayUrl: relay,
  };
}
