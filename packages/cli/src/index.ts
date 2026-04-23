#!/usr/bin/env node

/**
 * hnch CLI — terminal client for pointing poker.
 *
 * Usage:
 *   hnch create [--name "Sprint 42"] [--password] [--scale fibonacci|tshirt]
 *   hnch join <code> [--password]
 *   hnch config [--name "Alice"] [--relay-url ws://...]
 */

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import React from 'react'
import { render } from 'ink'
import { loadConfig, readConfig, updateConfig } from './config.js'
import { createSession, joinSession } from './session.js'
import { FIBONACCI_SCALE, TSHIRT_SCALE, type Scale } from '@hnch/shared'
import { App } from './ui/App.js'
import { createInterface } from 'node:readline'

const SCALES: Record<string, Scale> = {
  fibonacci: FIBONACCI_SCALE,
  tshirt: TSHIRT_SCALE,
}

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
  scale: string
}): Promise<void> {
  const config = await loadConfig()
  let password: string | undefined
  if (argv.password) {
    password = await promptPassword()
  }

  const scale = SCALES[argv.scale]
  if (!scale) {
    console.error(`Unknown scale: ${argv.scale}. Use: fibonacci, tshirt`)
    process.exit(1)
  }

  const session = await createSession({
    participantId: config.participantId,
    displayName: config.displayName,
    relayUrl: config.relayUrl,
    sessionName: argv.name,
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

  const session = await joinSession({
    participantId: config.participantId,
    displayName: config.displayName,
    relayUrl: config.relayUrl,
    roomCode: argv.code.toUpperCase(),
    password,
  })

  console.error(`Joined room: ${session.roomCode}`)
  console.error('')

  const { waitUntilExit } = render(
    React.createElement(App, {
      session,
      participantId: config.participantId,
    }),
  )

  await waitUntilExit()
  session.disconnect()
  process.exit(0)
}

function handleConfig(argv: {
  name?: string
  relayUrl?: string
}): void {
  if (!argv.name && !argv.relayUrl) {
    const current = readConfig()
    console.log(JSON.stringify(current, null, 2))
    return
  }

  const patch: Record<string, string> = {}
  if (argv.name) patch['displayName'] = argv.name
  if (argv.relayUrl) patch['relayUrl'] = argv.relayUrl
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
          default: false,
        })
        .option('scale', {
          type: 'string',
          describe: 'Estimation scale',
          choices: ['fibonacci', 'tshirt'],
          default: 'fibonacci',
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
        }),
    (argv) => {
      handleConfig(argv as Parameters<typeof handleConfig>[0])
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
