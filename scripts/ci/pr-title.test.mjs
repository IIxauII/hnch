// Tests for scripts/ci/pr-title.mjs. node:test, not vitest: the
// detect-changes job runs them before it trusts the script, and it has no
// node_modules. Run locally with `pnpm test:ci-scripts`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
