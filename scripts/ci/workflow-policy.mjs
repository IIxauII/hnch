#!/usr/bin/env node
// Checks the workflow and composite-action files against the CI rules that a
// YAML edit could quietly break:
//
// - every job runs on a GitHub-hosted runner (ADR-0056): a fork PR's run uses
//   the workflow file from the PR, so a self-hosted label would run its code
//   on our machine;
// - every action is pinned to a full commit SHA, with a `# vX.Y.Z` comment
//   that Dependabot keeps up to date;
// - `npm install -g npm@...` names an exact version.
//
//   node scripts/ci/workflow-policy.mjs        # checks .github/, exit 1 on a problem
//
// Pure Node, no dependencies: detect-changes runs it before any install. Line
// based, not a YAML parser: the files keep `uses:` and `runs-on:` on one line.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { argv, cwd, exit, stderr } from 'node:process';

const USES = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/;
const PINNED = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/;
const VERSION_COMMENT = /^\s+#\s*v\d+\.\d+\.\d+\s*$/;
const RUNS_ON = /^\s*runs-on:\s*(.+?)\s*$/;
// GitHub-hosted image labels (ubuntu-24.04-arm, ubuntu-latest, macos-15, ...).
// A list or an expression could name a self-hosted label, so neither passes.
const HOSTED_LABEL = /^(ubuntu|macos|windows)-[\w.-]+$/;
const NPM_GLOBAL = /npm\s+(?:install|i)\s+(?:-g|--global)\s+npm@(\S+)/;
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * @param {string} text one workflow or action.yml file
 * @returns {{ line: number, problem: string }[]}
 */
export function checkWorkflow(text) {
  const problems = [];
  text.split('\n').forEach((raw, i) => {
    const line = i + 1;
    const uses = raw.match(USES);
    if (uses) {
      const [, ref, rest] = uses;
      if (!ref.startsWith('./') && !(PINNED.test(ref) && VERSION_COMMENT.test(rest))) {
        problems.push({
          line,
          problem: `${ref} is not pinned to a full commit SHA with a version comment`,
        });
      }
    }
    const runsOn = raw.match(RUNS_ON);
    if (runsOn && !HOSTED_LABEL.test(runsOn[1])) {
      problems.push({ line, problem: `runs-on ${runsOn[1]} is not a single GitHub-hosted label` });
    }
    const npm = raw.match(NPM_GLOBAL);
    if (npm && !EXACT_VERSION.test(npm[1])) {
      problems.push({ line, problem: `npm@${npm[1]} is not an exact npm version` });
    }
  });
  return problems;
}

/**
 * Every workflow and composite action under `<root>/.github`.
 * @param {string} root repo root
 * @returns {{ file: string, line: number, problem: string }[]}
 */
export function checkRepo(root) {
  const github = join(root, '.github');
  const files = readdirSync(github, { recursive: true })
    .map(String)
    .filter((f) => /^(workflows|actions)\//.test(f) && /\.ya?ml$/.test(f))
    .toSorted();
  return files.flatMap((f) => {
    const path = join(github, f);
    const file = relative(root, path);
    return checkWorkflow(readFileSync(path, 'utf8')).map(({ line, problem }) => ({
      file,
      line,
      problem,
    }));
  });
}

if (import.meta.url === `file://${argv[1]}`) {
  const problems = checkRepo(cwd());
  for (const { file, line, problem } of problems) {
    stderr.write(`::error file=${file},line=${line}::${problem}\n`);
  }
  exit(problems.length ? 1 : 0);
}
