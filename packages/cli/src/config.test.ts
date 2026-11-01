/**
 * Unit tests for CLI config I/O (packages/cli/src/config.ts).
 *
 * Uses XDG_CONFIG_HOME to redirect all file operations into a temporary
 * directory so tests are hermetic and leave no files behind.
 *
 * node:readline is mocked at module-load time (via vi.hoisted + vi.mock)
 * so that promptLine can be exercised without touching stdin.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// readline mock — hoisted so it applies before config.ts is imported

const mockRl = vi.hoisted(() => ({
  question: vi.fn<[string, (ans: string) => void], void>(),
  close: vi.fn(),
}));

vi.mock('node:readline', () => ({
  createInterface: vi.fn().mockReturnValue(mockRl),
}));

// Module under test (imported AFTER vi.mock is in place)

import { configDir, readConfig, writeConfig, loadConfig, updateConfig } from './config.js';

// Test lifecycle

let tmpBase: string;

beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), 'hnch-cfg-test-'));
  process.env['XDG_CONFIG_HOME'] = tmpBase;
  vi.clearAllMocks();
  // Default: promptLine resolves immediately with empty string
  mockRl.question.mockImplementation((_q, cb) => cb(''));
});

afterEach(() => {
  delete process.env['XDG_CONFIG_HOME'];
  delete process.env['HNCH_RELAY_URL'];
  rmSync(tmpBase, { recursive: true, force: true });
});

/** Write a complete config fixture so loadConfig() never prompts for displayName. */
function writeFullConfig(overrides: Record<string, unknown> = {}): void {
  const dir = join(tmpBase, 'hnch');
  mkdirSync(dir, { recursive: true });
  const cfg = {
    participantId: 'test-pid-abc123',
    displayName: 'Alice',
    relayUrl: 'https://hnch.dev',
    ...overrides,
  };
  writeFileSync(join(dir, 'config.json'), JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

describe('configDir', () => {
  it('returns XDG_CONFIG_HOME/hnch when XDG_CONFIG_HOME is set', () => {
    expect(configDir()).toBe(join(tmpBase, 'hnch'));
  });

  it('falls back to ~/.config/hnch when XDG_CONFIG_HOME is unset', () => {
    delete process.env['XDG_CONFIG_HOME'];
    const dir = configDir();
    expect(dir.endsWith(join('', 'hnch'))).toBe(true);
    expect(dir).toContain('.config');
    expect(dir).not.toContain(tmpBase);
  });
});

describe('readConfig', () => {
  it('returns {} when no config file exists', () => {
    expect(readConfig()).toEqual({});
  });

  it('parses and returns valid JSON config', () => {
    writeFullConfig({ defaultScale: 'fibonacci' });
    const cfg = readConfig();
    expect(cfg.participantId).toBe('test-pid-abc123');
    expect(cfg.displayName).toBe('Alice');
    expect(cfg.relayUrl).toBe('https://hnch.dev');
    expect(cfg.defaultScale).toBe('fibonacci');
  });

  it('returns {} when config file contains invalid JSON', () => {
    const dir = join(tmpBase, 'hnch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{ this is not valid json }', 'utf-8');
    expect(readConfig()).toEqual({});
  });

  it('returns {} when config file is empty', () => {
    const dir = join(tmpBase, 'hnch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '', 'utf-8');
    expect(readConfig()).toEqual({});
  });
});

describe('writeConfig', () => {
  it('creates the config directory and file if they do not exist', () => {
    writeConfig({ participantId: 'abc', displayName: 'Bob', relayUrl: 'http://r' });
    const cfg = readConfig();
    expect(cfg.participantId).toBe('abc');
    expect(cfg.displayName).toBe('Bob');
  });

  it('shallow-merges with existing config', () => {
    writeConfig({ participantId: 'abc', displayName: 'Bob', relayUrl: 'http://r' });
    writeConfig({ displayName: 'Carol' });
    const cfg = readConfig();
    expect(cfg.participantId).toBe('abc');
    expect(cfg.displayName).toBe('Carol');
    expect(cfg.relayUrl).toBe('http://r');
  });

  it('overwrites a field with the new value', () => {
    writeConfig({ relayUrl: 'http://old' });
    writeConfig({ relayUrl: 'http://new' });
    expect(readConfig().relayUrl).toBe('http://new');
  });

  it('writes valid JSON with a trailing newline', () => {
    writeConfig({ participantId: 'id1' });
    const raw = readFileSync(join(tmpBase, 'hnch', 'config.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('loadConfig', () => {
  it('returns stored config when all fields are present', async () => {
    writeFullConfig();
    const cfg = await loadConfig();
    expect(cfg.participantId).toBe('test-pid-abc123');
    expect(cfg.displayName).toBe('Alice');
    expect(cfg.relayUrl).toBe('https://hnch.dev');
  });

  it('passes through optional fields (defaultScale, defaultSessionName, defaultPassword)', async () => {
    writeFullConfig({
      defaultScale: 't-shirt',
      defaultSessionName: 'Sprint 42',
      defaultPassword: true,
    });
    const cfg = await loadConfig();
    expect(cfg.defaultScale).toBe('t-shirt');
    expect(cfg.defaultSessionName).toBe('Sprint 42');
    expect(cfg.defaultPassword).toBe(true);
  });

  it('HNCH_RELAY_URL env var overrides stored relayUrl', async () => {
    writeFullConfig({ relayUrl: 'https://hnch.dev' });
    process.env['HNCH_RELAY_URL'] = 'http://localhost:1234';
    const cfg = await loadConfig();
    expect(cfg.relayUrl).toBe('http://localhost:1234');
  });

  it('coerces ws:// stored relayUrl to http://', async () => {
    writeFullConfig({ relayUrl: 'ws://localhost:1234' });
    const cfg = await loadConfig();
    expect(cfg.relayUrl).toBe('http://localhost:1234');
  });

  it('coerces wss:// stored relayUrl to https://', async () => {
    writeFullConfig({ relayUrl: 'wss://relay.example.com' });
    const cfg = await loadConfig();
    expect(cfg.relayUrl).toBe('https://relay.example.com');
  });

  it('coerces ws:// env override to http://', async () => {
    writeFullConfig();
    process.env['HNCH_RELAY_URL'] = 'ws://localhost:4000';
    const cfg = await loadConfig();
    expect(cfg.relayUrl).toBe('http://localhost:4000');
  });

  it('uses default relayUrl when none stored, and persists it', async () => {
    const dir = join(tmpBase, 'hnch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ participantId: 'p1', displayName: 'Alice' }, null, 2) + '\n',
      'utf-8',
    );
    const cfg = await loadConfig();
    expect(cfg.relayUrl).toBe('https://hnch.dev');
    expect(readConfig().relayUrl).toBe('https://hnch.dev');
  });

  it('generates a fallback displayName when prompt returns empty string', async () => {
    // participantId present, displayName absent → promptLine called
    const dir = join(tmpBase, 'hnch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ participantId: 'abcdef123456', relayUrl: 'https://hnch.dev' }, null, 2) +
        '\n',
      'utf-8',
    );
    // mockRl.question is configured in beforeEach to call cb('') immediately
    const cfg = await loadConfig();
    expect(cfg.displayName).toBe('user-abcdef');
  });

  it('auto-seeds avatarColor deterministically from participantId on first load (ADR-0043)', async () => {
    const dir = join(tmpBase, 'hnch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify(
        { participantId: 'pid-stable', displayName: 'Alice', relayUrl: 'https://hnch.dev' },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    const cfg = await loadConfig();
    expect(cfg.avatarColor).toBeDefined();
    // Persisted so the next launch is stable.
    expect(readConfig().avatarColor).toBe(cfg.avatarColor);

    // Cold-launch again → same key.
    const cfg2 = await loadConfig();
    expect(cfg2.avatarColor).toBe(cfg.avatarColor);
  });

  it('keeps a stored valid avatarColor (palette key) unchanged', async () => {
    writeFullConfig({ avatarColor: 'teal' });
    const cfg = await loadConfig();
    expect(cfg.avatarColor).toBe('teal');
  });

  it('keeps a stored valid avatarColor (#rrggbb) unchanged', async () => {
    writeFullConfig({ avatarColor: '#abcdef' });
    const cfg = await loadConfig();
    expect(cfg.avatarColor).toBe('#abcdef');
  });

  it('reseeds avatarColor when stored value is malformed', async () => {
    writeFullConfig({ avatarColor: 'garbage-value' });
    const cfg = await loadConfig();
    expect(cfg.avatarColor).not.toBe('garbage-value');
    expect(cfg.avatarColor).toBeDefined();
  });

  it('uses the display name returned by promptLine', async () => {
    const dir = join(tmpBase, 'hnch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ participantId: 'pid1', relayUrl: 'https://hnch.dev' }, null, 2) + '\n',
      'utf-8',
    );
    mockRl.question.mockImplementationOnce((_q, cb) => cb('  Alice  '));
    const cfg = await loadConfig();
    expect(cfg.displayName).toBe('Alice');
  });
});

describe('updateConfig', () => {
  it('writes new fields to a fresh config', () => {
    updateConfig({ participantId: 'pid1', displayName: 'Dave' });
    const cfg = readConfig();
    expect(cfg.participantId).toBe('pid1');
    expect(cfg.displayName).toBe('Dave');
  });

  it('merges into existing config without removing untouched fields', () => {
    writeConfig({ participantId: 'pid1', displayName: 'Dave', relayUrl: 'https://r' });
    updateConfig({ displayName: 'Eve' });
    const cfg = readConfig();
    expect(cfg.participantId).toBe('pid1');
    expect(cfg.displayName).toBe('Eve');
    expect(cfg.relayUrl).toBe('https://r');
  });

  it('deletes a string field when set to empty string', () => {
    writeConfig({ participantId: 'pid1', displayName: 'Dave', relayUrl: 'https://r' });
    updateConfig({ displayName: '' });
    const cfg = readConfig();
    expect(cfg.displayName).toBeUndefined();
    expect(cfg.participantId).toBe('pid1');
  });

  it('does not delete a field when value is undefined (skip semantics)', () => {
    writeConfig({ participantId: 'pid1', displayName: 'Dave' });
    updateConfig({ displayName: undefined });
    expect(readConfig().displayName).toBe('Dave');
  });

  it('can clear multiple fields at once', () => {
    writeConfig({ participantId: 'pid1', displayName: 'Dave', relayUrl: 'https://r' });
    updateConfig({ displayName: '', relayUrl: '' });
    const cfg = readConfig();
    expect(cfg.displayName).toBeUndefined();
    expect(cfg.relayUrl).toBeUndefined();
    expect(cfg.participantId).toBe('pid1');
  });
});
