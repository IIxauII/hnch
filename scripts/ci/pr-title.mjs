#!/usr/bin/env node
// Checks a PR title against Conventional Commits and the scope allowlist.
// The squash merge makes the title the commit on main, so it drives the
// release. Called by the detect-changes job in .github/workflows/ci.yml:
//
//   PR_TITLE="fix(relay): ..." node scripts/ci/pr-title.mjs
//
// The title comes in through the environment so it never passes through a
// shell. Exits 1 with a ::error:: annotation when the title fails.
//
// Pure Node, no dependencies: detect-changes does not install node_modules.
import { argv, env, exit, stdout } from 'node:process';

/** The scope allowlist. CONTRIBUTING's scope table describes each one. */
export const SCOPES = [
  'client',
  'relay',
  'cli',
  'shared',
  'e2e',
  'ci',
  'docs',
  'infra',
  'deps',
  'repo',
];

/**
 * The types amannn/action-semantic-pull-request accepted before this script
 * replaced it (the conventional-commit-types list). The release rules in
 * scripts/release/build-releaserc.mjs give feat, fix and perf a release.
 */
export const TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

// The conventionalcommits parser's header shape: type, optional scope,
// optional breaking `!`, then ": " and the subject.
const HEADER = /^(?<type>\w+)(?:\((?<scope>[^()]*)\))?!?: (?<subject>.*)$/;

/**
 * @param {string} title
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function checkPrTitle(title) {
  const fail = (error) => ({ ok: false, error });
  const m = HEADER.exec(title);
  if (!m) {
    return fail(
      `No release type found in pull request title "${title}". Use "<type>(<scope>): <subject>", see https://www.conventionalcommits.org/. Types: ${TYPES.join(', ')}.`,
    );
  }
  const { type, scope, subject } = m.groups;
  if (!subject.trim()) return fail(`No subject found in pull request title "${title}".`);
  if (!TYPES.includes(type)) {
    return fail(
      `Unknown release type "${type}" found in pull request title "${title}". Types: ${TYPES.join(', ')}.`,
    );
  }
  if (!scope) {
    return fail(
      `No scope found in pull request title "${title}". Scope must match one of: ${SCOPES.join(', ')}.`,
    );
  }
  // Same scope syntax as scripts/check-commit-scope.sh. The release rules
  // match `<pkg>` between commas, so `client, shared` would skip shared.
  if (!/^[^,\s]+(,[^,\s]+)*$/.test(scope)) {
    return fail(
      `Scope "${scope}" in pull request title "${title}" must be comma-separated with no spaces, e.g. "fix(relay,shared): ...".`,
    );
  }
  const unknown = scope.split(',').filter((s) => !SCOPES.includes(s));
  if (unknown.length > 0) {
    return fail(
      `Unknown ${unknown.length > 1 ? 'scopes' : 'scope'} "${unknown.join(',')}" found in pull request title "${title}". Scope must match one of: ${SCOPES.join(', ')}.`,
    );
  }
  return { ok: true };
}

if (argv[1] === import.meta.filename) {
  const title = env.PR_TITLE;
  if (title === undefined) {
    stdout.write('::error title=PR title::PR_TITLE is not set\n');
    exit(1);
  }
  const result = checkPrTitle(title);
  if (result.ok) {
    stdout.write(`PR title OK: ${title}\n`);
  } else {
    // The annotation puts the reason on the run summary, not only in the log.
    stdout.write(`::error title=PR title::${result.error}\n`);
    exit(1);
  }
}
