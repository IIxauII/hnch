#!/usr/bin/env node
// Checks the workflow and composite-action files against the CI rules that a
// YAML edit could quietly break:
//
// - every job runs on a GitHub-hosted runner (ADR-0056): a fork PR's run uses
//   the workflow file from the PR, so a self-hosted label would run its code
//   on our machine;
// - every action is pinned to a full commit SHA, with a `# vX.Y.Z` comment
//   that Dependabot keeps up to date;
// - `npm install -g npm` names an exact version.
//
//   node scripts/ci/workflow-policy.mjs   # from the repo root; exit 1 on a problem
//
// Run by the detect-changes job, whose ::error annotations point at the line.
// Pure Node, no dependencies: detect-changes runs it before any install. Line
// based, not a YAML parser, so it insists on the one-line forms it can read:
// `runs-on: <label>` and `uses: <ref>@<sha> # vX.Y.Z`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { argv, cwd, exit, stderr } from 'node:process';

const PINNED = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/u;
const VERSION_COMMENT = /^#\s*v\d+\.\d+\.\d+$/u;
// GitHub-hosted image labels only. A list, an expression or a block could
// name a self-hosted runner, so none of them passes.
const HOSTED_LABEL =
  /^(?:ubuntu-(?:latest|\d{2}\.\d{2})(?:-arm)?|macos-(?:latest|\d{2})(?:-(?:large|xlarge|intel))?|windows-(?:latest|\d{4}|11-arm))$/u;
const NPM_GLOBAL = /npm\s+(?:install|i)\s+(?:-g|--global)\s+npm(?:@(\S+))?(?![\w@-])/u;
const EXACT_VERSION = /^\d+\.\d+\.\d+$/u;

/**
 * The value of a `key:` line (optionally a `- key:` list item), unquoted, and
 * its trailing `# comment`; null when the line is not that key.
 * @param {string} raw
 * @param {string} key
 * @returns {{ value: string, comment: string } | null}
 */
function field(raw, key) {
  const m = raw.match(new RegExp(`^\\s*(?:-\\s+)?${key}:(.*)$`, 'u'));
  if (!m) return null;
  const rest = m[1].trim();
  const quoted = rest.match(/^(["'])(.*?)\1\s*(.*)$/u);
  if (quoted) return { value: quoted[2], comment: quoted[3] };
  const hash = rest.search(/(?:^|\s)#/u);
  if (hash === -1) return { value: rest, comment: '' };
  return { value: rest.slice(0, hash).trim(), comment: rest.slice(hash).trim() };
}

/**
 * @param {string} text one workflow or action.yml file
 * @returns {{ line: number, problem: string }[]}
 */
export function checkWorkflow(text) {
  const problems = [];
  text.split('\n').forEach((raw, i) => {
    const line = i + 1;
    const uses = field(raw, 'uses');
    if (
      uses &&
      !uses.value.startsWith('./') &&
      !(PINNED.test(uses.value) && VERSION_COMMENT.test(uses.comment))
    ) {
      problems.push({
        line,
        problem: `${uses.value} is not pinned to a full commit SHA with a version comment`,
      });
    }
    const runsOn = field(raw, 'runs-on');
    if (runsOn && !HOSTED_LABEL.test(runsOn.value)) {
      problems.push({
        line,
        problem: `runs-on ${runsOn.value || '(block)'} is not a single GitHub-hosted label on the runs-on line`,
      });
    }
    const npm = raw.match(NPM_GLOBAL);
    if (npm && !EXACT_VERSION.test(npm[1] ?? '')) {
      const version = npm[1] === undefined ? 'npm (no version)' : `npm@${npm[1]}`;
      problems.push({ line, problem: `${version} is not an exact npm version` });
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
    .filter((f) => /^(?:workflows|actions)\//u.test(f) && /\.ya?ml$/u.test(f))
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

if (argv[1] === import.meta.filename) {
  const problems = checkRepo(cwd());
  for (const { file, line, problem } of problems) {
    stderr.write(`::error file=${file},line=${line}::${problem}\n`);
  }
  exit(problems.length > 0 ? 1 : 0);
}
