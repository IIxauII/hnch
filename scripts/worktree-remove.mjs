#!/usr/bin/env node
// Remove a git worktree.
//
// Usage:
//   pnpm worktree:remove <name>
//
// Resolves dir = ../hnch-<name>, runs `git worktree remove`. Refuses if the
// worktree has uncommitted changes (no --force by default).

import { spawnSync } from 'node:child_process'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const args = process.argv.slice(2)
if (args.length < 1) {
  console.error('Usage: pnpm worktree:remove <name>')
  process.exit(1)
}

const name = args[0]
const repoName = basename(repoRoot)
const worktreeDir = resolve(repoRoot, '..', `${repoName}-${name.replace(/\//g, '-')}`)

console.log(`→ Removing worktree at ${worktreeDir}`)

const result = spawnSync('git', ['worktree', 'remove', worktreeDir], {
  cwd: repoRoot,
  stdio: 'inherit',
})

if (result.status !== 0) {
  console.error('✗ git worktree remove failed.')
  console.error('  If the worktree has uncommitted changes, commit or stash them first,')
  console.error('  or pass --force manually: git worktree remove --force', worktreeDir)
  process.exit(result.status ?? 1)
}

console.log('✓ Worktree removed.')
