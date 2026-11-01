// Tests for scripts/ci/pr-title.mjs. node:test, not vitest: the
// detect-changes job runs them before it trusts the script, and it has no
// node_modules. Run locally with `pnpm test:ci-scripts`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, it } from 'node:test';
import { checkPrTitle } from './pr-title.mjs';

describe('checkPrTitle', () => {
  it('accepts a typed, scoped title', () => {
    assert.deepEqual(checkPrTitle('fix(relay): close idle sockets'), { ok: true });
  });

  it('rejects a title without a scope and lists the allowed scopes', () => {
    const result = checkPrTitle('fix: close idle sockets');
    assert.equal(result.ok, false);
    assert.match(result.error, /^No scope found in pull request title "fix: close idle sockets"\./);
    assert.match(
      result.error,
      /Scope must match one of: client, relay, cli, shared, e2e, ci, docs, infra, deps, repo\.$/,
    );
  });

  it('rejects a scope outside the allowlist', () => {
    const result = checkPrTitle('feat(web): add a button');
    assert.equal(result.ok, false);
    assert.match(result.error, /^Unknown scope "web" found in pull request title/);
  });

  it('names every unknown scope of a multi-scope title', () => {
    const result = checkPrTitle('feat(client,web,api): add a button');
    assert.equal(result.ok, false);
    assert.match(result.error, /^Unknown scopes "web,api" found/);
  });

  // The release rules match `<pkg>`, `*,<pkg>`, `<pkg>,*`: a space after the
  // comma would silently skip that package's release.
  it('rejects spaces between scopes, as the commit-msg hook does', () => {
    const result = checkPrTitle('feat(client, shared): add vote payload field');
    assert.equal(result.ok, false);
    assert.match(result.error, /comma-separated with no spaces/);
  });

  it('rejects an empty scope between commas', () => {
    const result = checkPrTitle('fix(relay,,shared): correct snapshot TTL');
    assert.equal(result.ok, false);
    assert.match(result.error, /comma-separated with no spaces/);
  });

  // The list amannn/action-semantic-pull-request accepted before this check
  // replaced it (conventional-commit-types).
  it('accepts every Conventional Commits type', () => {
    for (const type of [
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
    ]) {
      assert.deepEqual(checkPrTitle(`${type}(repo): a change`), { ok: true }, type);
    }
  });

  it('rejects an unknown type', () => {
    const result = checkPrTitle('feature(client): add a button');
    assert.equal(result.ok, false);
    assert.match(result.error, /^Unknown release type "feature" found in pull request title/);
  });

  it('rejects a title with no type prefix', () => {
    const result = checkPrTitle('Add a button to the lobby');
    assert.equal(result.ok, false);
    assert.match(result.error, /^No release type found in pull request title/);
  });

  it('rejects a title with no subject', () => {
    const result = checkPrTitle('fix(relay): ');
    assert.equal(result.ok, false);
    assert.match(result.error, /^No subject found in pull request title/);
  });

  it('accepts a breaking multi-scope title', () => {
    assert.deepEqual(checkPrTitle('feat(client,cli,shared)!: drop legacy join URL'), { ok: true });
  });

  // The scope Dependabot appends for devDependencies when a config sets
  // `commit-message.include: scope`. .github/dependabot.yml must not.
  it('rejects the deps-dev scope', () => {
    const result = checkPrTitle('chore(deps-dev): bump vitest from 3.2.4 to 4.0.0');
    assert.equal(result.ok, false);
    assert.match(result.error, /^Unknown scope "deps-dev" found in pull request title/);
  });
});

// The titles Dependabot opens PRs with are `<prefix>: bump ...`, where
// <prefix> is `commit-message.prefix` (or `prefix-development`) from
// .github/dependabot.yml. An `include: scope` would append `(deps)` or
// `(deps-dev)` to the prefix, so the config must not set it. Read with a
// regex, not a YAML parser: this file runs without node_modules.
describe('.github/dependabot.yml titles', () => {
  const config = readFileSync(
    join(import.meta.dirname, '..', '..', '.github', 'dependabot.yml'),
    'utf8',
  );
  // Key, then the value with optional quotes and an optional trailing
  // comment. One regex for the count and the values, so a line the value
  // capture cannot read fails the count instead of dropping out silently.
  const prefixLines = [
    ...config.matchAll(/^\s*(prefix(?:-development)?):\s*(['"]?)([^'"#\s]+)\2\s*(?:#.*)?$/gm),
  ];
  const prefixes = prefixLines.map((m) => m[3]);

  it('sets a commit-message prefix for every ecosystem', () => {
    const ecosystems = config.match(/^\s*- package-ecosystem:/gm) ?? [];
    assert.ok(ecosystems.length > 0, 'no package-ecosystem entries found');
    const prefixKeys = config.match(/^\s*prefix(?:-development)?:/gm) ?? [];
    assert.equal(prefixLines.length, prefixKeys.length, 'a prefix line has an unreadable value');
    const productionPrefixes = prefixLines.filter((m) => m[1] === 'prefix');
    assert.equal(
      productionPrefixes.length,
      ecosystems.length,
      'every package-ecosystem needs a commit-message prefix',
    );
  });

  it('produces titles that pass the lint, with the deps scope', () => {
    for (const prefix of prefixes) {
      const title = `${prefix}: bump the angular group across 1 directory with 17 updates`;
      assert.deepEqual(checkPrTitle(title), { ok: true }, title);
      assert.match(prefix, /\(deps\)$/, `${prefix} does not end in the deps scope`);
    }
  });

  // In Dependabot's schema `include` only exists under commit-message, and
  // `scope` is its only value, so any `include:` key is the hazard.
  it('does not append a scope to the prefix', () => {
    assert.doesNotMatch(config, /^\s*include:/m);
  });
});

describe('pr-title.mjs CLI', () => {
  const script = join(import.meta.dirname, 'pr-title.mjs');
  const run = (title) =>
    spawnSync('node', [script], { env: { ...process.env, PR_TITLE: title }, encoding: 'utf8' });

  it('exits 0 for a valid title', () => {
    const { status, stdout } = run('ci(ci,docs): fold the first wave into one job');
    assert.equal(status, 0);
    assert.match(stdout, /^PR title OK: ci\(ci,docs\): fold the first wave into one job$/m);
  });

  it('exits 1 with a GitHub error annotation for a bad title', () => {
    const { status, stdout } = run('fix: no scope');
    assert.equal(status, 1);
    assert.match(
      stdout,
      /^::error title=PR title::No scope found in pull request title "fix: no scope"\./m,
    );
  });

  it('fails when PR_TITLE is missing', () => {
    const { status } = spawnSync('node', [script], {
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    });
    assert.equal(status, 1);
  });
});
