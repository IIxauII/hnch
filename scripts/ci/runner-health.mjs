// Runner pool health check for .github/workflows/runner-health.yml: fails when
// no hnch-podman runner is present, or none carries the e2e label (the single
// e2e slot, ADR-0052).
//
// The runners are ephemeral: each deregisters after its job and its slot
// re-registers 10-30 s later, so one look often lands in that gap. A check
// passes as soon as one look sees the runner, and fails only when every look
// over LOOKS x INTERVAL misses it. A busy runner is present: it is running a
// job. Each look logs the full runner list, so a red run's log shows what was
// missing.
//
// Usage: REPO=owner/name GH_TOKEN=... node scripts/ci/runner-health.mjs
// RUNNER_HEALTH_LOOKS and RUNNER_HEALTH_INTERVAL_MS override the defaults.
import { execFile } from 'node:child_process';
import { argv, env, exit, stdout } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const LOOKS = 5;
const INTERVAL_MS = 30_000;

const POOL = ['hnch-podman'];
const E2E = ['hnch-podman', 'e2e'];

const carries = (r, labels) => {
  const have = new Set(r.labels.map((l) => l.name));
  return labels.every((l) => have.has(l));
};
const present = (runners, labels) =>
  runners.filter((r) => (r.status === 'online' || r.busy) && carries(r, labels)).length;

const duration = (ms) => (ms % 60_000 === 0 ? `${ms / 60_000} min` : `${ms / 1000} s`);

/**
 * Looks at the runner list up to `looks` times, `intervalMs` apart, and stops
 * at the first look that completes the picture. `look` resolves to the API's
 * `runners` array or rejects; a rejected look counts as a miss.
 * Resolves to { ok, errors }, one error message per failed check.
 */
export async function checkRunnerHealth({ look, sleep, log, looks, intervalMs }) {
  let poolSeen = false;
  let e2eSeen = false;
  let listed = false;
  let lastError;
  for (let n = 1; n <= looks; n++) {
    let runners;
    try {
      runners = await look();
      listed = true;
    } catch (err) {
      lastError = err.message;
      log(`Look ${n}/${looks}: could not list the runners: ${lastError}`);
    }
    if (runners) {
      const pool = present(runners, POOL);
      const e2e = present(runners, E2E);
      log(`Look ${n}/${looks}: ${pool} hnch-podman runner(s) present, ${e2e} with e2e`);
      for (const r of runners) {
        const labels = r.labels.map((l) => l.name).join(', ');
        log(`  ${r.name} ${r.status} ${r.busy ? 'busy' : 'idle'} [${labels}]`);
      }
      if (runners.length === 0) log('  (no runners registered)');
      poolSeen ||= pool >= 1;
      e2eSeen ||= e2e >= 1;
      if (poolSeen && e2eSeen) return { ok: true, errors: [] };
    }
    if (n < looks) await sleep(intervalMs);
  }
  const span = `in any of ${looks} looks over ${duration((looks - 1) * intervalMs)}`;
  if (!listed) return { ok: false, errors: [`Could not list the runners ${span}: ${lastError}`] };
  const errors = [];
  if (!poolSeen) errors.push(`No hnch-podman runner present (online or busy) ${span}`);
  if (!e2eSeen) {
    errors.push(
      `No present hnch-podman runner carries the e2e label ${span} (slot 1 down or mislabeled); e2e jobs will queue`,
    );
  }
  return { ok: false, errors };
}

async function lookViaGh(repo) {
  try {
    const { stdout: body } = await promisify(execFile)(
      'gh',
      ['api', `/repos/${repo}/actions/runners?per_page=100`],
      { timeout: 30_000 },
    );
    return JSON.parse(body).runners;
  } catch (err) {
    throw new Error(err.stderr?.trim() || err.message, { cause: err });
  }
}

if (argv[1] === import.meta.filename) {
  const repo = env.REPO;
  if (!repo) {
    stdout.write('::error::REPO (owner/name) is not set\n');
    exit(1);
  }
  const { ok, errors } = await checkRunnerHealth({
    look: () => lookViaGh(repo),
    sleep: (ms) => delay(ms),
    log: (line) => stdout.write(`${line}\n`),
    looks: Number(env.RUNNER_HEALTH_LOOKS) || LOOKS,
    intervalMs: Number(env.RUNNER_HEALTH_INTERVAL_MS) || INTERVAL_MS,
  });
  for (const e of errors) stdout.write(`::error::${e}\n`);
  exit(ok ? 0 : 1);
}
