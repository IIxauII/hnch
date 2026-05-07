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
import { resolveRoom } from './relay-api.js';
import { resolveScale, BUILTIN_SCALES, hashPassword, joinDoc } from '@hnch/shared';
import { normalizeAndValidateRoomCode } from './room-code-input.js';
import { writeLastSession, clearLastSession, readLastSession } from './last-session.js';
import { onSessionExpired } from './session-expired.js';
import { observeSessionEnd } from './session-end-observer.js';
import { App } from './ui/App.js';
import { ConfigSettings } from './ui/components/ConfigSettings.js';
import { createInterface } from 'node:readline';

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
  });

  let passwordHash: string | undefined;
  if (password) {
    passwordHash = await hashPassword(password, session.roomUuid);
  }

  writeLastSession({
    roomCode: session.roomCode,
    roomUuid: session.roomUuid,
    passwordHash,
    lastSeenAt: Date.now(),
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
    passwordHash,
    lastSeenAt: Date.now(),
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

async function handleResume(): Promise<void> {
  const config = await loadConfig();
  const cache = readLastSession();

  if (!cache) {
    console.error('No recent session to resume.');
    process.exit(0);
  }

  let resolved: Awaited<ReturnType<typeof resolveRoom>>;
  try {
    resolved = await resolveRoom(config.relayUrl, cache.roomCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Room not found')) {
      return await onSessionExpired({ clearLastSession, logger: console, exit: process.exit });
    }
      console.error('Could not reach relay — try again later.');
      process.exit(0);
    
  }

  if (resolved.accessMode === 'password' && !cache.passwordHash) {
    console.error(`Password changed — rejoin with: hnch join ${cache.roomCode} --password`);
    clearLastSession();
    process.exit(0);
  }

  console.error(`Rejoining room ${cache.roomCode}…`);
  console.error('');

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);

  joinDoc(doc, {
    participantId: config.participantId,
    displayName: config.displayName,
  });

  awareness.setLocalStateField('participantId', config.participantId);

  let hadWrongPassword = false;
  let hadRoomFull = false;
  let unmountInkResume: (() => void) | undefined;

  const session = wireSession({
    doc,
    awareness,
    roomCode: cache.roomCode,
    roomUuid: cache.roomUuid,
    participantId: config.participantId,
    relayUrl: config.relayUrl,
    passwordHash: cache.passwordHash,
    onRejection(reason) {
      if (reason === 'unknown-room') {
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

  writeLastSession({
    roomCode: session.roomCode,
    roomUuid: session.roomUuid,
    passwordHash: cache.passwordHash,
    lastSeenAt: Date.now(),
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

  await inkInstanceResume.waitUntilExit();

  if (hadRoomFull) {
    console.error('This room is full (max 20 participants).');
    clearLastSession();
    process.exit(1);
  }

  if (hadWrongPassword) {
    console.error(`Password changed — rejoin with: hnch join ${cache.roomCode} --password`);
    clearLastSession();
    process.exit(0);
  }

  session.disconnect();
  clearLastSession();
  process.exit(0);
}

async function handleConfig(argv: {
  name?: string;
  relayUrl?: string;
  scale?: string;
  sessionName?: string;
  password?: boolean;
}): Promise<void> {
  const hasFlags =
    argv.name !== undefined ||
    argv.relayUrl !== undefined ||
    argv.scale !== undefined ||
    argv.sessionName !== undefined ||
    argv.password !== undefined;

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
        }),
    (argv) => {
      handleConfig(argv as Parameters<typeof handleConfig>[0]).catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      });
    },
  )
  .demandCommand(1, 'Specify a command: create, join, resume, or config')
  .strict()
  .help();

// No subcommand → show help + exit 0 (not error)
const args = hideBin(process.argv);
if (args.length === 0 || (args.length === 1 && args[0] === '--')) {
  cli.showHelp();
  process.exit(0);
}

cli.parse();
