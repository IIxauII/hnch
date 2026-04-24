#!/usr/bin/env node

/**
 * hnch CLI — terminal client for pointing poker.
 *
 * Usage:
 *   hnch create [--name "Sprint 42"] [--password] [--scale <id>]
 *   hnch join <code> [--password]
 *   hnch config [--name "Alice"] [--relay-url ws://...]
 */

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import React from 'react'
import { render } from 'ink'
import { loadConfig, readConfig, updateConfig } from './config.js'
import { createSession, joinSession } from './session.js'
import { resolveRoom } from './relay-api.js'
import { resolveScale, BUILTIN_SCALES } from '@hnch/shared'
import { App } from './ui/App.js'
import { ConfigSettings } from './ui/components/ConfigSettings.js'
import { createInterface } from 'node:readline'

async function promptPassword(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    process.stderr.write('Password: ')
    rl.question('', (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

async function handleCreate(argv: {
  name?: string
  password?: boolean
  scale?: string
}): Promise<void> {
  const config = await loadConfig()

  const resolvedScale = argv.scale ?? config.defaultScale ?? 'fibonacci'
  const resolvedName = argv.name ?? config.defaultSessionName
  const resolvedPassword = argv.password ?? config.defaultPassword ?? false

  let password: string | undefined
  if (resolvedPassword) {
    password = await promptPassword()
  }

  const scale = resolveScale(resolvedScale, config.presetOverrides, config.customScales)
  if (!scale) {
    const builtinIds = Object.keys(BUILTIN_SCALES).join(', ')
    console.error(`Unknown or fully-disabled scale: "${resolvedScale}". Builtin IDs: ${builtinIds}`)
    process.exit(1)
  }

  const session = await createSession({
    participantId: config.participantId,
    displayName: config.displayName,
    relayUrl: config.relayUrl,
    sessionName: resolvedName,
    password,
    defaultScale: scale,
  })

  console.error(`Room created: ${session.roomCode}`)
  console.error(`Share: hnch join ${session.roomCode}`)
  console.error('')

  const { waitUntilExit } = render(
    React.createElement(App, {
      session,
      participantId: config.participantId,
      displayName: config.displayName,
      accessMode: password ? 'password' : 'open',
      presetOverrides: config.presetOverrides,
      customScales: config.customScales,
    }),
  )

  await waitUntilExit()
  session.disconnect()
  process.exit(0)
}

async function handleJoin(argv: {
  code: string
  password?: boolean
}): Promise<void> {
  const config = await loadConfig()
  let password: string | undefined
  if (argv.password) {
    password = await promptPassword()
  }

  const resolved = await resolveRoom(config.relayUrl, argv.code.toUpperCase())

  let passwordInput: string | undefined
  if (resolved.accessMode === 'password' && !argv.password) {
    passwordInput = await promptPassword()
  } else if (argv.password) {
    passwordInput = password
  }

  const session = await joinSession({
    participantId: config.participantId,
    displayName: config.displayName,
    relayUrl: config.relayUrl,
    roomCode: argv.code.toUpperCase(),
    password: passwordInput,
  })

  console.error(`Joined room: ${session.roomCode}`)
  console.error('')

  const { waitUntilExit } = render(
    React.createElement(App, {
      session,
      participantId: config.participantId,
      displayName: config.displayName,
      accessMode: resolved.accessMode,
      presetOverrides: config.presetOverrides,
      customScales: config.customScales,
    }),
  )

  await waitUntilExit()
  session.disconnect()
  process.exit(0)
}


async function handleConfig(argv: {
  name?: string
  relayUrl?: string
  scale?: string
  sessionName?: string
  password?: boolean
}): Promise<void> {
  const hasFlags =
    argv.name !== undefined ||
    argv.relayUrl !== undefined ||
    argv.scale !== undefined ||
    argv.sessionName !== undefined ||
    argv.password !== undefined

  if (!hasFlags) {
    const config = await loadConfig()
    const { waitUntilExit } = render(
      React.createElement(ConfigSettings, {
        presetOverrides: config.presetOverrides,
        customScales: config.customScales,
      }),
    )
    await waitUntilExit()
    process.exit(0)
  }

  const patch: Parameters<typeof updateConfig>[0] = {}
  if (argv.name !== undefined) patch.displayName = argv.name
  if (argv.relayUrl !== undefined) patch.relayUrl = argv.relayUrl
  if (argv.scale !== undefined) {
    if (argv.scale !== '') {
      const cfg = readConfig()
      if (!resolveScale(argv.scale, cfg.presetOverrides, cfg.customScales)) {
        console.error(`Unknown scale: "${argv.scale}". Builtin IDs: ${Object.keys(BUILTIN_SCALES).join(', ')}`)
        return
      }
    }
    patch.defaultScale = argv.scale
  }
  if (argv.sessionName !== undefined) patch.defaultSessionName = argv.sessionName
  if (argv.password !== undefined) patch.defaultPassword = argv.password
  updateConfig(patch)
  console.log('Config updated.')
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
          describe: 'Estimation scale ID (fibonacci, t-shirt, powers-of-2, linear, risk, or custom-<id>)',
        }),
    (argv) => {
      handleCreate(argv as Parameters<typeof handleCreate>[0]).catch((err) => {
        console.error(err instanceof Error ? err.message : err)
        process.exit(1)
      })
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
        console.error(err instanceof Error ? err.message : err)
        process.exit(1)
      })
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
        console.error(err instanceof Error ? err.message : err)
        process.exit(1)
      })
    },
  )
  .demandCommand(1, 'Specify a command: create, join, or config')
  .strict()
  .help()

// No subcommand → show help + exit 0 (not error)
const args = hideBin(process.argv)
if (args.length === 0 || (args.length === 1 && args[0] === '--')) {
  cli.showHelp()
  process.exit(0)
}

cli.parse()
