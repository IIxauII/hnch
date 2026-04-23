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
import { loadConfig, readConfig, updateConfig, promptLine } from './config.js'
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

  const scale = SCALES[resolvedScale]
  if (!scale) {
    console.error(`Unknown scale: ${resolvedScale}. Use: fibonacci, tshirt`)
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

async function runConfigMenu(): Promise<void> {
  const SETTINGS = [
    {
      label: 'Display name',
      key: 'displayName' as const,
      display: (v: unknown) => (typeof v === 'string' && v ? v : 'not set'),
    },
    {
      label: 'Relay URL',
      key: 'relayUrl' as const,
      display: (v: unknown) => (typeof v === 'string' && v ? v : 'not set'),
    },
    {
      label: 'Default scale',
      key: 'defaultScale' as const,
      display: (v: unknown) => (typeof v === 'string' && v ? v : 'not set'),
    },
    {
      label: 'Default session name',
      key: 'defaultSessionName' as const,
      display: (v: unknown) => (typeof v === 'string' && v ? v : 'not set'),
    },
    {
      label: 'Default password',
      key: 'defaultPassword' as const,
      display: (v: unknown) => (v === true ? 'on' : 'off'),
    },
  ]

  while (true) {
    const current = readConfig()
    const maxLabel = Math.max(...SETTINGS.map((s) => s.label.length))
    process.stderr.write('\n')
    for (let i = 0; i < SETTINGS.length; i++) {
      const s = SETTINGS[i]!
      const val = current[s.key as keyof typeof current]
      const label = s.label.padEnd(maxLabel)
      process.stderr.write(`  ${i + 1}. ${label}  [${s.display(val)}]\n`)
    }
    process.stderr.write('\n')
    const pick = await promptLine('Pick a setting to edit (1-5), or q to quit: ')
    if (pick === 'q' || pick === '') break
    const idx = parseInt(pick, 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= SETTINGS.length) {
      process.stderr.write('Invalid choice.\n')
      continue
    }
    const setting = SETTINGS[idx]!
    if (setting.key === 'defaultPassword') {
      const answer = await promptLine(`Default password on/off [current: ${setting.display(current[setting.key])}] (on/off): `)
      if (answer === 'on') updateConfig({ defaultPassword: true })
      else if (answer === 'off') updateConfig({ defaultPassword: false })
      else process.stderr.write('Enter "on" or "off".\n')
    } else if (setting.key === 'defaultScale') {
      const answer = await promptLine(`Default scale (fibonacci|tshirt, leave blank to clear): `)
      if (answer !== '' && !Object.keys(SCALES).includes(answer)) {
        process.stderr.write(`Invalid scale "${answer}". Use: ${Object.keys(SCALES).join(', ')}\n`)
      } else {
        updateConfig({ defaultScale: answer })
      }
    } else {
      const answer = await promptLine(`${setting.label} (leave blank to clear): `)
      updateConfig({ [setting.key]: answer } as Parameters<typeof updateConfig>[0])
    }
  }
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
    const current = readConfig()
    console.log(JSON.stringify(current, null, 2))
    const answer = await promptLine('\nEdit settings? [y/N] ')
    if (answer.toLowerCase() === 'y') {
      await runConfigMenu()
    }
    return
  }

  const patch: Parameters<typeof updateConfig>[0] = {}
  if (argv.name !== undefined) patch.displayName = argv.name
  if (argv.relayUrl !== undefined) patch.relayUrl = argv.relayUrl
  if (argv.scale !== undefined) patch.defaultScale = argv.scale
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
          describe: 'Estimation scale',
          choices: ['fibonacci', 'tshirt'],
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
          describe: 'Set default estimation scale (fibonacci|tshirt, empty string clears)',
          choices: ['fibonacci', 'tshirt', ''],
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
