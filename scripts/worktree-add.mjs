#!/usr/bin/env node
// Create a new git worktree and bootstrap it.
//
// Usage:
//   pnpm worktree:add <name> [base-branch]
//
// Resolves dir = ../hnch-<name>, creates branch <name> off <base-branch> (default
// `main`), runs scripts/worktree-bootstrap.sh inside the new worktree.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const args = process.argv.slice(2)
if (args.length < 1) {
  console.error('Usage: pnpm worktree:add <name> [base-branch]')
  process.exit(1)
}

const name = args[0]
const baseBranch = args[1] ?? 'main'

if (!/^[a-zA-Z0-9._/-]+$/.test(name)) {
  console.error(`✗ Invalid worktree name: "${name}". Allowed: letters, digits, dot, underscore, slash, dash.`)
  process.exit(1)
}

const repoName = basename(repoRoot)
const worktreeDir = resolve(repoRoot, '..', `${repoName}-${name.replace(/\//g, '-')}`)

if (existsSync(worktreeDir)) {
  console.error(`✗ Target dir already exists: ${worktreeDir}`)
  process.exit(1)
}

console.log(`→ Creating worktree:`)
console.log(`    name:        ${name}`)
console.log(`    base branch: ${baseBranch}`)
console.log(`    path:        ${worktreeDir}`)

const addResult = spawnSync('git', ['worktree', 'add', '-b', name, worktreeDir, baseBranch], {
  cwd: repoRoot,
  stdio: 'inherit',
})

if (addResult.status !== 0) {
  console.error('✗ git worktree add failed')
  process.exit(addResult.status ?? 1)
}

const bootstrapResult = spawnSync('bash', [resolve(repoRoot, 'scripts/worktree-bootstrap.sh')], {
  cwd: worktreeDir,
  stdio: 'inherit',
})

if (bootstrapResult.status !== 0) {
  console.error('✗ Bootstrap failed. Worktree was created at:', worktreeDir)
  console.error('  Fix the issue and rerun: cd', worktreeDir, '&& pnpm worktree:bootstrap')
  process.exit(bootstrapResult.status ?? 1)
}

console.log('')
console.log(`✓ Worktree ready. Open: cd ${worktreeDir}`)
