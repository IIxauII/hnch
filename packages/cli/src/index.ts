/**
 * hnch CLI — terminal client for pointing poker.
 *
 * Usage:
 *   hnch create [--name "Sprint 42"] [--password] [--scale <id>]
 *   hnch join <code> [--password]
 *   hnch resume
 *   hnch config [--name "Alice"] [--relay-url https://...]
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import React from 'react';
import { render } from 'ink';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { loadConfig, readConfig, updateConfig } from './config.js';
import { createSession, joinSession, wireSession } from './session.js';
import {
  AWARENESS_PARTICIPANT_ID_FIELD,
  BUILTIN_SCALES,
  hashPassword,
  joinDoc,
  parseAvatarColor,
  RelayRejectionError,
  resolveRoom,
  resolveScale,
} from '@hnch/shared';
import { normalizeAndValidateRoomCode } from './room-code-input.js';
import {
  recordEntry,
  readEntries,
  removeEntry,
  clearPasswordHash,
  // legacy shims — used in create/join below
  writeLastSession,
  clearLastSession,
  type LastSessionEntry,
} from './last-session.js';
import { onSessionExpired } from './session-expired.js';
import { observeSessionEnd } from './session-end-observer.js';
import { App } from './ui/App.js';
import { ConfigSettings } from './ui/components/ConfigSettings.js';
import { createInterface } from 'node:readline';
import {
  handleAgendaAdd,
  handleAgendaList,
  handleAgendaSkip,
  handleAgendaCancel,
  handleAgendaMv,
} from './commands/agenda.js';

async function promptPassword(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    process.stderr.write('Password: ');
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function handleCreate(argv: {
  name?: string;
  password?: boolean;
  scale?: string;
}): Promise<void> {
  const config = await loadConfig();

  const resolvedScale = argv.scale ?? config.defaultScale ?? 'fibonacci';
  const resolvedName = argv.name ?? config.defaultSessionName;
  const resolvedPassword = argv.password ?? config.defaultPassword ?? false;

  let password: string | undefined;
  if (resolvedPassword) {
    password = await promptPassword();
  }

  const scale = resolveScale(resolvedScale, config.presetOverrides, config.customScales);
  if (!scale) {
    const builtinIds = Object.keys(BUILTIN_SCALES).join(', ');
    console.error(
      `Unknown or fully-disabled scale: "${resolvedScale}". Builtin IDs: ${builtinIds}`,
    );
    process.exit(1);
  }

  const session = await createSession({
    participantId: config.participantId,
    displayName: config.displayName,
    relayUrl: config.relayUrl,
    sessionName: resolvedName,
    password,
    defaultScale: scale,
    ...(config.avatarColor !== undefined && { avatarColor: config.avatarColor }),
  });

  let passwordHash: string | undefined;
  if (password) {
    passwordHash = await hashPassword(password, session.roomUuid);
  }

  writeLastSession({
    roomCode: session.roomCode,
    roomUuid: session.roomUuid,
    lastSeenAt: Date.now(),
    ...(passwordHash !== undefined && { passwordHash }),
  });

  console.error(`Room created: ${session.roomCode}`);
  console.error(`Share: hnch join ${session.roomCode}`);
  console.error('');

  const { waitUntilExit, unmount: unmountCreate } = render(
    React.createElement(App, {
      session,
      participantId: config.participantId,
      displayName: config.displayName,
      accessMode: password ? 'password' : 'open',
      presetOverrides: config.presetOverrides,
      customScales: config.customScales,
    }),
  );

  observeSessionEnd({
    doc: session.doc,
    localParticipantId: config.participantId,
    onEnded: async (info) => {
      console.error(info.isLocal ? 'Session ended.' : `Session ended by ${info.hostName}.`);
      unmountCreate();
      try {
        await clearLastSession();
      } catch (err) {
        console.error(
          `Failed to clear cached session: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      session.disconnect();
      process.exit(0);
    },
  });

  await waitUntilExit();
  session.disconnect();
  clearLastSession();
  process.exit(0);
}

async function handleJoin(argv: { code: string; password?: boolean }): Promise<void> {
  const config = await loadConfig();
  const code = normalizeAndValidateRoomCode(argv.code);
  if (code === null) {
    console.error('invalid room code');
    process.exit(1);
  }

  let password: string | undefined;
  if (argv.password) {
    password = await promptPassword();
  }

  const resolved = await resolveRoom(config.relayUrl, code);

  let passwordInput: string | undefined;
  if (resolved.accessMode === 'password' && !argv.password) {
    passwordInput = await promptPassword();
  } else if (argv.password) {
    passwordInput = password;
  }

  let unmountInk: (() => void) | undefined;
  let hadRoomFull = false;

  const session = await joinSession({
    participantId: config.participantId,
    displayName: config.displayName,
    relayUrl: config.relayUrl,
    roomCode: code,
    password: passwordInput,
    ...(config.avatarColor !== undefined && { avatarColor: config.avatarColor }),
    onRejection(reason) {
      if (reason === 'unknown-room') {
        void onSessionExpired({ clearLastSession, logger: console, exit: process.exit });
        return;
      }
      if (reason === 'room-full') {
        hadRoomFull = true;
        unmountInk?.();
      }
    },
  });

  let passwordHash: string | undefined;
  if (passwordInput) {
    passwordHash = await hashPassword(passwordInput, session.roomUuid);
  }

  writeLastSession({
    roomCode: session.roomCode,
    roomUuid: session.roomUuid,
    lastSeenAt: Date.now(),
    ...(passwordHash !== undefined && { passwordHash }),
  });

  console.error(`Joined room: ${session.roomCode}`);
  console.error('');

  const inkInstance = render(
    React.createElement(App, {
      session,
      participantId: config.participantId,
      displayName: config.displayName,
      accessMode: resolved.accessMode,
      presetOverrides: config.presetOverrides,
      customScales: config.customScales,
    }),
  );
  unmountInk = inkInstance.unmount;

  observeSessionEnd({
    doc: session.doc,
    localParticipantId: config.participantId,
    onEnded: async (info) => {
      console.error(info.isLocal ? 'Session ended.' : `Session ended by ${info.hostName}.`);
      unmountInk?.();
      try {
        await clearLastSession();
      } catch (err) {
        console.error(
          `Failed to clear cached session: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      session.disconnect();
      process.exit(0);
    },
  });

  await inkInstance.waitUntilExit();

  if (hadRoomFull) {
    console.error('This room is full (max 20 participants).');
    session.disconnect();
    clearLastSession();
    process.exit(1);
  }

  session.disconnect();
  clearLastSession();
  process.exit(0);
}

/** Tiny relative-time helper — keeps moment/dayjs out of CLI. */
function relativeTime(lastSeenAt: number, now: number = Date.now()): string {
  const diffMs = now - lastSeenAt;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

async function promptSelection(max: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const ask = (): void => {
      process.stderr.write(`Select [1-${max}]: `);
      rl.question('', (answer) => {
        const n = parseInt(answer.trim(), 10);
        if (Number.isInteger(n) && n >= 1 && n <= max) {
          rl.close();
          resolve(n);
        } else {
          process.stderr.write(`Invalid choice — enter a number between 1 and ${max}.\n`);
          ask();
        }
      });
    };
    rl.on('close', () => reject(new Error('stdin closed')));
    ask();
  });
}

async function resumeEntry(
  config: Awaited<ReturnType<typeof loadConfig>>,
  entry: LastSessionEntry,
): Promise<void> {
  let resolved: Awaited<ReturnType<typeof resolveRoom>>;
  try {
    resolved = await resolveRoom(config.relayUrl, entry.roomCode);
  } catch (err) {
    if (err instanceof RelayRejectionError && err.reason === 'unknown-room') {
      removeEntry(entry.roomUuid);
      return await onSessionExpired({ clearLastSession, logger: console, exit: process.exit });
    }
    console.error('Could not reach relay — try again later.');
    process.exit(0);
  }

  if (resolved.accessMode === 'password' && !entry.passwordHash) {
    console.error(`Password changed — rejoin with: hnch join ${entry.roomCode} --password`);
    clearPasswordHash(entry.roomUuid);
    process.exit(0);
  }

  console.error(`Rejoining room ${entry.roomCode}…`);
  console.error('');

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);

  joinDoc(doc, {
    participantId: config.participantId,
    displayName: config.displayName,
    joinedAt: Date.now(),
    ...(config.avatarColor !== undefined && { avatarColor: config.avatarColor }),
  });

  awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, config.participantId);

  let hadWrongPassword = false;
  let hadRoomFull = false;
  let unmountInkResume: (() => void) | undefined;

  const session = wireSession({
    doc,
    awareness,
    roomCode: entry.roomCode,
    roomUuid: entry.roomUuid,
    participantId: config.participantId,
    relayUrl: config.relayUrl,
    passwordHash: entry.passwordHash,
    // `hnch resume` is a rejoin: if this participant left the room earlier,
    // the snapshot still carries their `leftAt` (ADR-0036 §6).
    clearLeftStatusOnSync: true,
    onRejection(reason) {
      if (reason === 'unknown-room') {
        removeEntry(entry.roomUuid);
        void onSessionExpired({ clearLastSession, logger: console, exit: process.exit });
        return;
      }
      if (reason === 'wrong-password') {
        hadWrongPassword = true;
        unmountInkResume?.();
      }
      if (reason === 'room-full') {
        hadRoomFull = true;
        unmountInkResume?.();
      }
    },
  });

  recordEntry({
    roomCode: session.roomCode,
    roomUuid: session.roomUuid,
    lastSeenAt: Date.now(),
    ...(entry.passwordHash !== undefined && { passwordHash: entry.passwordHash }),
  });

  const inkInstanceResume = render(
    React.createElement(App, {
      session,
      participantId: config.participantId,
      displayName: config.displayName,
      accessMode: resolved.accessMode,
      presetOverrides: config.presetOverrides,
      customScales: config.customScales,
    }),
  );
  unmountInkResume = inkInstanceResume.unmount;

  observeSessionEnd({
    doc: session.doc,
    localParticipantId: config.participantId,
    onEnded: async (info) => {
      console.error(info.isLocal ? 'Session ended.' : `Session ended by ${info.hostName}.`);
      unmountInkResume?.();
      try {
        removeEntry(entry.roomUuid);
      } catch (err) {
        console.error(
          `Failed to clear cached session: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      session.disconnect();
      process.exit(0);
    },
  });

  await inkInstanceResume.waitUntilExit();

  if (hadRoomFull) {
    console.error('This room is full (max 20 participants).');
    session.disconnect();
    process.exit(1);
  }

  if (hadWrongPassword) {
    clearPasswordHash(entry.roomUuid);
    console.error(`Password changed — rejoin with: hnch join ${entry.roomCode} --password`);
    session.disconnect();
    process.exit(0);
  }

  session.disconnect();
  removeEntry(entry.roomUuid);
  process.exit(0);
}

async function handleResume(): Promise<void> {
  const config = await loadConfig();
  const entries = readEntries();

  if (entries.length === 0) {
    console.error('No recent session to resume.');
    process.exit(0);
  }

  if (entries.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return resumeEntry(config, entries[0]!);
  }

  // 2+ entries — print numbered list, prompt
  const now = Date.now();
  process.stderr.write('Recent rooms:\n');
  for (const [i, e] of entries.entries()) {
    const rel = relativeTime(e.lastSeenAt, now);
    process.stderr.write(`  ${i + 1}. ${e.roomCode}  (${rel})\n`);
  }
  process.stderr.write('\n');

  let choice: number;
  try {
    choice = await promptSelection(entries.length);
  } catch {
    console.error('No selection made.');
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return resumeEntry(config, entries[choice - 1]!);
}

async function handleConfig(argv: {
  name?: string;
  relayUrl?: string;
  scale?: string;
  sessionName?: string;
  password?: boolean;
  color?: string;
}): Promise<void> {
  const hasFlags =
    argv.name !== undefined ||
    argv.relayUrl !== undefined ||
    argv.scale !== undefined ||
    argv.sessionName !== undefined ||
    argv.password !== undefined ||
    argv.color !== undefined;

  if (!hasFlags) {
    const config = await loadConfig();
    const { waitUntilExit } = render(
      React.createElement(ConfigSettings, {
        presetOverrides: config.presetOverrides,
        customScales: config.customScales,
      }),
    );
    await waitUntilExit();
    process.exit(0);
  }

  const patch: Parameters<typeof updateConfig>[0] = {};
  if (argv.name !== undefined) patch.displayName = argv.name;
  if (argv.relayUrl !== undefined) patch.relayUrl = argv.relayUrl;
  if (argv.scale !== undefined) {
    if (argv.scale !== '') {
      const cfg = readConfig();
      if (!resolveScale(argv.scale, cfg.presetOverrides, cfg.customScales)) {
        console.error(
          `Unknown scale: "${argv.scale}". Builtin IDs: ${Object.keys(BUILTIN_SCALES).join(', ')}`,
        );
        return;
      }
    }
    patch.defaultScale = argv.scale;
  }
  if (argv.sessionName !== undefined) patch.defaultSessionName = argv.sessionName;
  if (argv.password !== undefined) patch.defaultPassword = argv.password;
  if (argv.color !== undefined) {
    const normalized =
      argv.color.startsWith('#') || argv.color === '' ? argv.color : argv.color.toLowerCase();
    if (normalized !== '' && parseAvatarColor(normalized) === null) {
      console.error(`Invalid color: "${argv.color}". Pass a palette key or #rrggbb hex literal.`);
      process.exit(1);
    }
    patch.avatarColor = normalized;
  }
  updateConfig(patch);
  console.log('Config updated.');
}

const cli = yargs(hideBin(process.argv))
  .scriptName('hnch')
  .usage('$0 <command> — terminal pointing poker')
  .command(
    'create',
    'Create a new room',
    (y) =>
      y
        .option('name', {
          type: 'string',
          describe: 'Session name',
        })
        .option('password', {
          type: 'boolean',
          describe: 'Protect room with a password',
        })
        .option('scale', {
          type: 'string',
          describe:
            'Estimation scale ID (fibonacci, t-shirt, powers-of-2, linear, risk, or custom-<id>)',
        }),
    (argv) => {
      handleCreate(argv as Parameters<typeof handleCreate>[0]).catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      });
    },
  )
  .command(
    'join <code>',
    'Join an existing room',
    (y) =>
      y
        .positional('code', {
          type: 'string',
          demandOption: true,
          describe: '6-character room code',
        })
        .option('password', {
          type: 'boolean',
          describe: 'Room requires a password',
          default: false,
        }),
    (argv) => {
      handleJoin(argv as Parameters<typeof handleJoin>[0]).catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      });
    },
  )
  .command(
    'resume',
    'Rejoin your last session',
    (y) => y,
    () => {
      handleResume().catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      });
    },
  )
  .command(
    'config',
    'View or update CLI config',
    (y) =>
      y
        .option('name', {
          type: 'string',
          describe: 'Set display name',
        })
        .option('relay-url', {
          type: 'string',
          describe: 'Set relay URL',
        })
        .option('scale', {
          type: 'string',
          describe: 'Set default estimation scale ID (empty string clears)',
        })
        .option('session-name', {
          type: 'string',
          describe: 'Set default session name (empty string clears)',
        })
        .option('password', {
          type: 'boolean',
          describe: 'Set default password prompt on (--password) or off (--no-password)',
        })
        .option('color', {
          type: 'string',
          describe:
            'Set avatar color: a palette key (e.g. "blue", "racing-green") or a #rrggbb hex literal',
        }),
    (argv) => {
      handleConfig(argv as Parameters<typeof handleConfig>[0]).catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      });
    },
  )
  .command(
    'agenda',
    'Manage the pre-session story agenda',
    (y) =>
      y
        .command(
          'add',
          'Add an agenda item',
          (yy) =>
            yy
              .option('title', {
                type: 'string',
                describe: 'Story title',
              })
              .option('ticket', {
                type: 'string',
                describe: 'Issue tracker reference (e.g. PROJ-123)',
              })
              .option('description', {
                type: 'string',
                describe: 'Story description',
              })
              .check((args) => {
                if (!args.title?.trim() && !args.ticket?.trim()) {
                  throw new Error('At least one of --title or --ticket is required');
                }
                return true;
              }),
          (argv) => {
            handleAgendaAdd(
              argv as { title?: string; ticket?: string; description?: string },
            ).catch((err) => {
              console.error(err instanceof Error ? err.message : err);
              process.exit(1);
            });
          },
        )
        .command(
          'list',
          'List agenda items in order',
          (yy) => yy,
          () => {
            handleAgendaList().catch((err) => {
              console.error(err instanceof Error ? err.message : err);
              process.exit(1);
            });
          },
        )
        .command(
          'skip <id>',
          'Mark an agenda item as skipped',
          (yy) =>
            yy.positional('id', {
              type: 'string',
              demandOption: true,
              describe: 'Agenda item ID',
            }),
          (argv) => {
            handleAgendaSkip(argv as { id: string }).catch((err) => {
              console.error(err instanceof Error ? err.message : err);
              process.exit(1);
            });
          },
        )
        .command(
          'cancel <id>',
          'Soft-delete (cancel) an agenda item',
          (yy) =>
            yy.positional('id', {
              type: 'string',
              demandOption: true,
              describe: 'Agenda item ID',
            }),
          (argv) => {
            handleAgendaCancel(argv as { id: string }).catch((err) => {
              console.error(err instanceof Error ? err.message : err);
              process.exit(1);
            });
          },
        )
        .command(
          'mv <id>',
          'Reorder an agenda item (--before <id> | --after <id>)',
          (yy) =>
            yy
              .positional('id', {
                type: 'string',
                demandOption: true,
                describe: 'Agenda item ID to move',
              })
              .option('before', {
                type: 'string',
                describe: 'sortKey of item that should come before the moved item',
              })
              .option('after', {
                type: 'string',
                describe: 'sortKey of item that should come after the moved item',
              })
              .check((args) => {
                if (args.before !== undefined && args.after !== undefined) {
                  throw new Error('--before and --after are mutually exclusive');
                }
                if (args.before === undefined && args.after === undefined) {
                  throw new Error('Specify either --before <id> or --after <id>');
                }
                return true;
              }),
          (argv) => {
            handleAgendaMv(argv as { id: string; before?: string; after?: string }).catch((err) => {
              console.error(err instanceof Error ? err.message : err);
              process.exit(1);
            });
          },
        )
        .demandCommand(1, 'Specify an agenda subcommand: add, list, skip, cancel, mv')
        .strict()
        .help(),
    // Void handler — subcommand is required
    () => {},
  )
  .demandCommand(1, 'Specify a command: create, join, resume, config, or agenda')
  .strict()
  .help();

// No subcommand → show help + exit 0 (not error)
const args = hideBin(process.argv);
if (args.length === 0 || (args.length === 1 && args[0] === '--')) {
  cli.showHelp();
  process.exit(0);
}

cli.parse();
