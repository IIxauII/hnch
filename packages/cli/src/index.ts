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
import { loadConfig, readConfig, updateConfig, promptLine } from './config.js'
import { createSession, joinSession } from './session.js'
import { resolveScale, BUILTIN_SCALES, formatScaleId, type CustomScale } from '@hnch/shared'
import { App } from './ui/App.js'
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
      presetOverrides: config.presetOverrides,
      customScales: config.customScales,
    }),
  )

  await waitUntilExit()
  session.disconnect()
  process.exit(0)
}

async function runCustomScaleMenu(): Promise<void> {
  while (true) {
    const current = readConfig()
    const customs: CustomScale[] = current.customScales ?? []
    process.stderr.write('\n── Custom scales ──\n')
    if (customs.length === 0) {
      process.stderr.write('  (none)\n')
    } else {
      for (let i = 0; i < customs.length; i++) {
        const c = customs[i]!
        process.stderr.write(`  ${i + 1}. ${c.label}  [${c.cards.join(', ')}]\n`)
      }
    }
    process.stderr.write('\n')
    process.stderr.write('  a. Add custom scale\n')
    if (customs.length > 0) {
      process.stderr.write('  e. Edit a custom scale\n')
      process.stderr.write('  r. Remove a custom scale\n')
    }
    process.stderr.write('  q. Back\n\n')

    const pick = await promptLine('Choice: ')
    if (pick === 'q' || pick === '') break

    if (pick === 'a') {
      const label = await promptLine('Scale name (e.g. "My Team Scale"): ')
      if (!label.trim()) { process.stderr.write('Name cannot be empty.\n'); continue }
      const cardsRaw = await promptLine('Cards, comma-separated (e.g. 1,2,4,8): ')
      const cards = cardsRaw.split(',').map((c) => c.trim()).filter(Boolean)
      if (cards.length === 0) { process.stderr.write('Must have at least one card.\n'); continue }
      const id = `custom-${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
      const next: CustomScale[] = [...customs, { id, label: label.trim(), cards }]
      updateConfig({ customScales: next })
      process.stderr.write(`Added "${label.trim()}" as ${id}\n`)
    } else if (pick === 'e' && customs.length > 0) {
      const idxStr = await promptLine(`Edit which scale? (1-${customs.length}): `)
      const idx = parseInt(idxStr, 10) - 1
      if (isNaN(idx) || idx < 0 || idx >= customs.length) {
        process.stderr.write('Invalid choice.\n')
        continue
      }
      const existing = customs[idx]!
      const label = await promptLine(`New name [${existing.label}] (leave blank to keep): `)
      const cardsRaw = await promptLine(`New cards [${existing.cards.join(', ')}] (leave blank to keep): `)
      const newLabel = label.trim() || existing.label
      const newCards = cardsRaw.trim()
        ? cardsRaw.split(',').map((c) => c.trim()).filter(Boolean)
        : existing.cards
      if (newCards.length === 0) { process.stderr.write('Must have at least one card.\n'); continue }
      const next = customs.map((c, i) => i === idx ? { ...c, label: newLabel, cards: newCards } : c)
      updateConfig({ customScales: next })
      process.stderr.write(`Updated "${newLabel}"\n`)
    } else if (pick === 'r' && customs.length > 0) {
      const idxStr = await promptLine(`Remove which scale? (1-${customs.length}): `)
      const idx = parseInt(idxStr, 10) - 1
      if (isNaN(idx) || idx < 0 || idx >= customs.length) {
        process.stderr.write('Invalid choice.\n')
      } else {
        const name = customs[idx]!.label
        const confirm = await promptLine(`Remove "${name}"? (y/N): `)
        if (confirm.toLowerCase() === 'y') {
          updateConfig({ customScales: customs.filter((_, i) => i !== idx) })
          process.stderr.write(`Removed "${name}"\n`)
        }
      }
    } else {
      process.stderr.write('Invalid choice.\n')
    }
  }
}

async function runPresetCustomizeMenu(): Promise<void> {
  const builtinEntries = Object.values(BUILTIN_SCALES)

  // Pick preset
  process.stderr.write('\n── Customize presets ──\n')
  for (let i = 0; i < builtinEntries.length; i++) {
    const s = builtinEntries[i]!
    process.stderr.write(`  ${i + 1}. ${formatScaleId(s.id)}\n`)
  }
  process.stderr.write('\n')
  const pick = await promptLine(`Pick a preset to customize (1-${builtinEntries.length}), or q to cancel: `)
  if (pick === 'q' || pick === '') return
  const presetIdx = parseInt(pick, 10) - 1
  if (isNaN(presetIdx) || presetIdx < 0 || presetIdx >= builtinEntries.length) {
    process.stderr.write('Invalid choice.\n')
    return
  }

  const preset = builtinEntries[presetIdx]!

  while (true) {
    const current = readConfig()
    const overrides = current.presetOverrides ?? {}
    const disabled: number[] = overrides[preset.id] ?? []

    process.stderr.write(`\n── ${formatScaleId(preset.id)} cards ──\n`)
    for (let i = 0; i < preset.cards.length; i++) {
      const isDisabled = disabled.includes(i)
      process.stderr.write(`  ${i + 1}. [${isDisabled ? 'x' : ' '}] ${preset.cards[i]}\n`)
    }
    process.stderr.write('\n  (toggle a card number, r to reset all, q to go back)\n\n')

    const action = await promptLine('Toggle card #, r to reset, or q: ')
    if (action === 'q' || action === '') break
    if (action === 'r') {
      const next = { ...overrides }
      delete next[preset.id]
      updateConfig({ presetOverrides: next })
      process.stderr.write('Reset to default.\n')
      continue
    }
    const cardIdx = parseInt(action, 10) - 1
    if (isNaN(cardIdx) || cardIdx < 0 || cardIdx >= preset.cards.length) {
      process.stderr.write('Invalid card number.\n')
      continue
    }
    const newDisabled = disabled.includes(cardIdx)
      ? disabled.filter((i) => i !== cardIdx)
      : [...disabled, cardIdx].sort((a, b) => a - b)
    if (newDisabled.length >= preset.cards.length) {
      process.stderr.write('At least one card must remain enabled.\n')
      continue
    }
    const next = { ...overrides, [preset.id]: newDisabled }
    if (newDisabled.length === 0) delete next[preset.id]
    updateConfig({ presetOverrides: next })
  }
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

  const EXTRA_ITEMS = [
    { label: 'Customize preset cards', key: 'customize-presets' as const },
    { label: 'Manage custom scales',   key: 'custom-scales' as const },
  ]

  const totalItems = SETTINGS.length + EXTRA_ITEMS.length

  while (true) {
    const current = readConfig()
    const maxLabel = Math.max(
      ...SETTINGS.map((s) => s.label.length),
      ...EXTRA_ITEMS.map((e) => e.label.length),
    )
    process.stderr.write('\n')
    for (let i = 0; i < SETTINGS.length; i++) {
      const s = SETTINGS[i]!
      const val = current[s.key as keyof typeof current]
      const label = s.label.padEnd(maxLabel)
      process.stderr.write(`  ${i + 1}. ${label}  [${s.display(val)}]\n`)
    }
    for (let i = 0; i < EXTRA_ITEMS.length; i++) {
      const e = EXTRA_ITEMS[i]!
      process.stderr.write(`  ${SETTINGS.length + i + 1}. ${e.label.padEnd(maxLabel)}\n`)
    }
    process.stderr.write('\n')
    const pick = await promptLine(`Pick a setting to edit (1-${totalItems}), or q to quit: `)
    if (pick === 'q' || pick === '') break
    const idx = parseInt(pick, 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= totalItems) {
      process.stderr.write('Invalid choice.\n')
      continue
    }

    // Extra items
    if (idx >= SETTINGS.length) {
      const extra = EXTRA_ITEMS[idx - SETTINGS.length]!
      if (extra.key === 'customize-presets') await runPresetCustomizeMenu()
      else if (extra.key === 'custom-scales') await runCustomScaleMenu()
      continue
    }

    const setting = SETTINGS[idx]!
    if (setting.key === 'defaultPassword') {
      const answer = await promptLine(`Default password on/off [current: ${setting.display(current[setting.key])}] (on/off): `)
      if (answer === 'on') updateConfig({ defaultPassword: true })
      else if (answer === 'off') updateConfig({ defaultPassword: false })
      else process.stderr.write('Enter "on" or "off".\n')
    } else if (setting.key === 'defaultScale') {
      const builtinIds = Object.keys(BUILTIN_SCALES).join(', ')
      const answer = await promptLine(`Default scale (${builtinIds}, or custom-<id>, leave blank to clear): `)
      if (answer !== '') {
        const cfg = readConfig()
        if (!resolveScale(answer, cfg.presetOverrides, cfg.customScales)) {
          process.stderr.write(`Unknown or fully-disabled scale "${answer}". Builtin IDs: ${builtinIds}\n`)
          continue
        }
      }
      updateConfig({ defaultScale: answer })
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
