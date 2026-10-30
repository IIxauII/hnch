// Tests for scripts/ci/runner-health.mjs. node:test, not vitest: the runner
// health job runs on a bare ubuntu-latest runner with no node_modules. Run
// locally with `node --test scripts/ci/runner-health.test.mjs`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { checkRunnerHealth } from './runner-health.mjs';

const runner = (name, { status = 'online', busy = false, e2e = false } = {}) => ({
  name,
  status,
  busy,
  labels: ['self-hosted', 'linux', 'arm64', 'hnch-podman', ...(e2e ? ['e2e'] : [])].map((n) => ({
    name: n,
  })),
});

const healthy = [runner('hnch-runner-1-100', { e2e: true }), runner('hnch-runner-2-100')];

/** Runs the check against a fixed sequence of looks; an Error entry makes that look throw. */
async function run(looks, opts = {}) {
  const seen = [];
  const slept = [];
  const log = [];
  let i = 0;
  const result = await checkRunnerHealth({
    look: async () => {
      const next = looks[Math.min(i++, looks.length - 1)];
      seen.push(next);
      if (next instanceof Error) throw next;
      return next;
    },
    sleep: async (ms) => {
      slept.push(ms);
    },
    log: (line) => log.push(line),
    looks: 5,
    intervalMs: 30_000,
    ...opts,
  });
  return { ...result, looks: seen.length, slept, log: log.join('\n') };
}

describe('checkRunnerHealth', () => {
  it('passes on the first look when the pool and the e2e slot are online', async () => {
    const r = await run([healthy]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.looks, 1);
    assert.deepEqual(r.slept, []);
  });

  it('looks again after a miss and passes once the runner has re-registered', async () => {
    const gap = [runner('hnch-runner-2-100')];
    const r = await run([gap, gap, healthy]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.looks, 3);
    assert.deepEqual(r.slept, [30_000, 30_000]);
  });

  it('fails after every look misses the whole pool', async () => {
    const r = await run([[]]);
    assert.equal(r.ok, false);
    assert.equal(r.looks, 5);
    assert.equal(r.slept.length, 4);
    assert.deepEqual(r.errors, [
      'No hnch-podman runner online in any of 5 looks over 2 min',
      'No online hnch-podman runner carries the e2e label in any of 5 looks over 2 min (slot 1 down or mislabeled); e2e jobs will queue',
    ]);
  });

  it('fails on a missing e2e slot while the rest of the pool is up', async () => {
    const r = await run([[runner('hnch-runner-2-100'), runner('hnch-runner-3-100')]]);
    assert.equal(r.ok, false);
    assert.equal(r.looks, 5);
    assert.deepEqual(r.errors, [
      'No online hnch-podman runner carries the e2e label in any of 5 looks over 2 min (slot 1 down or mislabeled); e2e jobs will queue',
    ]);
  });

  it('does not count offline registrations or runners outside the pool', async () => {
    const other = { name: 'laptop', status: 'online', busy: false, labels: [{ name: 'e2e' }] };
    const r = await run([[runner('hnch-runner-1-99', { status: 'offline', e2e: true }), other]]);
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 2);
  });

  it('counts a runner busy with a job as present', async () => {
    const r = await run([
      [runner('hnch-runner-1-100', { status: 'offline', busy: true, e2e: true })],
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.looks, 1);
  });

  it('logs every runner each look saw, so a red run shows what was missing', async () => {
    const r = await run([
      [
        runner('hnch-runner-2-100', { busy: true }),
        runner('hnch-runner-1-99', { status: 'offline', e2e: true }),
      ],
    ]);
    assert.equal(r.ok, false);
    assert.match(
      r.log,
      /Look 1\/5: 1 hnch-podman runner\(s\) present, 0 with e2e\n {2}hnch-runner-2-100 online busy \[self-hosted, linux, arm64, hnch-podman\]\n {2}hnch-runner-1-99 offline idle \[self-hosted, linux, arm64, hnch-podman, e2e\]/,
    );
    assert.match(r.log, /Look 5\/5: /);
  });

  it('logs an empty runner list as such', async () => {
    const r = await run([[]], { looks: 1 });
    assert.match(
      r.log,
      /Look 1\/1: 0 hnch-podman runner\(s\) present, 0 with e2e\n {2}\(no runners registered\)/,
    );
  });

  it('treats a failed API call as one more look, not an outage', async () => {
    const r = await run([new Error('HTTP 502'), healthy]);
    assert.equal(r.ok, true);
    assert.equal(r.looks, 2);
    assert.match(r.log, /HTTP 502/);
  });

  it('fails with the API error when no look could list the runners', async () => {
    const r = await run([new Error('HTTP 401: Bad credentials')]);
    assert.equal(r.ok, false);
    assert.equal(r.looks, 5);
    assert.deepEqual(r.errors, [
      'Could not list the runners in any of 5 looks over 2 min: HTTP 401: Bad credentials',
    ]);
  });
});

describe('runner-health.mjs (CLI)', () => {
  const bin = mkdtempSync(join(tmpdir(), 'runner-health-'));
  after(() => rmSync(bin, { recursive: true, force: true }));

  /** Runs the script with a fake `gh` on PATH that prints `body` (or fails with `exit`). */
  function cli(body, { exit = 0 } = {}) {
    const response = join(bin, 'response.json');
    writeFileSync(response, JSON.stringify(body));
    writeFileSync(
      join(bin, 'gh'),
      `#!/bin/sh\n[ ${exit} -eq 0 ] || { echo 'HTTP 401: Bad credentials' >&2; exit ${exit}; }\ncat "${response}"\n`,
    );
    chmodSync(join(bin, 'gh'), 0o755);
    return spawnSync(process.execPath, [join(import.meta.dirname, 'runner-health.mjs')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        REPO: 'IIxauII/hnch',
        RUNNER_HEALTH_LOOKS: '2',
        RUNNER_HEALTH_INTERVAL_MS: '1',
      },
    });
  }

  it('exits 0 for a healthy pool', () => {
    const r = cli({ total_count: 2, runners: healthy });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Look 1\/2: 2 hnch-podman runner\(s\) present, 1 with e2e/);
  });

  it('exits 1 with one ::error:: per missing check', () => {
    const r = cli({ total_count: 1, runners: [runner('hnch-runner-2-100')] });
    assert.equal(r.status, 1);
    assert.match(
      r.stdout,
      /^::error::No online hnch-podman runner carries the e2e label in any of 2 looks over 0\.001 s/m,
    );
    assert.doesNotMatch(r.stdout, /::error::No hnch-podman runner online/);
  });

  it('exits 1 naming the API error when gh fails on every look', () => {
    const r = cli({}, { exit: 1 });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /::error::Could not list the runners .*HTTP 401: Bad credentials/);
  });
});
