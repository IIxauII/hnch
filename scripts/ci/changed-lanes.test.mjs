// Tests for scripts/ci/changed-lanes.mjs. node:test, not vitest: the
// detect-changes job runs them before it trusts the script, and it has no
// node_modules. Run locally with `pnpm test:ci-scripts`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { allLanes, changedLanes, formatOutputs } from './changed-lanes.mjs';

const lanesOf = (files) => changedLanes(files).verifyPackages;
const e2eOf = (files) => changedLanes(files).lanes.e2e;

describe('changedLanes', () => {
  it('fans a relay source change out to the CLI, shared and e2e lanes', () => {
    const { lanes, verifyPackages } = changedLanes(['packages/relay/src/server.ts']);
    assert.deepEqual(lanes, {
      shared: true,
      relay: true,
      client: false,
      cli: true,
      e2e: true,
      root: false,
    });
    assert.deepEqual(verifyPackages, ['shared', 'relay', 'cli']);
  });

  it('starts no lane for Markdown at a package root', () => {
    const files = [
      'packages/relay/README.md',
      'packages/cli/CHANGELOG.md',
      'packages/client/CLAUDE.md',
      'packages/cli/LICENSE.md',
      'packages/e2e/README.md',
    ];
    const { lanes, verifyPackages, ignored } = changedLanes(files);
    assert.deepEqual(verifyPackages, []);
    assert.equal(lanes.e2e, false);
    assert.deepEqual(ignored, files);
  });

  it('runs the package lanes as today when a README comes with a source file', () => {
    const files = ['packages/client/README.md', 'packages/client/src/main.ts'];
    assert.deepEqual(lanesOf(files), ['client']);
    assert.equal(e2eOf(files), true);
  });

  it('still counts Markdown nested inside a package', () => {
    assert.deepEqual(lanesOf(['packages/client/src/assets/notes.md']), ['client']);
  });

  it('starts no lane for root or docs Markdown', () => {
    const files = ['README.md', 'CONTRIBUTING.md', 'docs/ux.md', 'adr/0001-x.md'];
    assert.deepEqual(lanesOf(files), []);
    assert.equal(e2eOf(files), false);
  });

  it('starts no lane for an empty change list', () => {
    assert.deepEqual(lanesOf(['']), []);
  });

  it('runs every lane and e2e for a root file', () => {
    for (const f of [
      'pnpm-lock.yaml',
      'package.json',
      'tsconfig.base.json',
      '.github/workflows/ci.yml',
    ]) {
      const { lanes, verifyPackages } = changedLanes([f]);
      assert.equal(lanes.root, true, f);
      assert.equal(lanes.e2e, true, f);
      assert.deepEqual(verifyPackages, ['shared', 'relay', 'client', 'cli'], f);
    }
  });

  it('fans a shared change out to every lane and e2e', () => {
    const files = ['packages/shared/src/index.ts'];
    assert.deepEqual(lanesOf(files), ['shared', 'relay', 'client', 'cli']);
    assert.equal(e2eOf(files), true);
  });

  it('keeps a CLI change to the CLI lane', () => {
    const files = ['packages/cli/src/index.tsx'];
    assert.deepEqual(lanesOf(files), ['cli']);
    assert.equal(e2eOf(files), false);
  });

  // The e2e job runs the e2e package's typecheck, format check and lint
  // itself, so an e2e-only change has an empty verify matrix.
  it('runs e2e with no verify lane for an e2e spec change', () => {
    const files = ['packages/e2e/tests/lobby.spec.ts'];
    assert.deepEqual(lanesOf(files), []);
    assert.equal(e2eOf(files), true);
  });

  it('runs the relay and client lanes for the shared deploy-guard helpers', () => {
    const files = ['scripts/cloudflare/worker-guard.mjs'];
    assert.deepEqual(lanesOf(files), ['shared', 'relay', 'client', 'cli']);
    assert.equal(e2eOf(files), true);
  });

  it('runs the relay lane for its stall sampler, not for the rest of scripts/ci', () => {
    assert.deepEqual(lanesOf(['scripts/ci/with-stall-sampler.sh']), ['shared', 'relay', 'cli']);
    assert.deepEqual(lanesOf(['scripts/ci/changed-lanes.mjs']), []);
    assert.equal(e2eOf(['scripts/ci/changed-lanes.mjs']), false);
  });
});

describe('allLanes', () => {
  it('turns every lane on', () => {
    const { lanes, verifyPackages } = allLanes();
    assert.deepEqual(lanes, {
      shared: true,
      relay: true,
      client: true,
      cli: true,
      e2e: true,
      root: true,
    });
    assert.deepEqual(verifyPackages, ['shared', 'relay', 'client', 'cli']);
  });
});

describe('formatOutputs', () => {
  it('emits an empty verify-packages array rather than nothing', () => {
    assert.equal(
      formatOutputs(changedLanes(['packages/relay/README.md'])),
      [
        'shared=false',
        'relay=false',
        'client=false',
        'cli=false',
        'e2e=false',
        'root=false',
        'verify-packages=[]',
        '',
      ].join('\n'),
    );
  });
});

describe('CLI', () => {
  const script = join(import.meta.dirname, 'changed-lanes.mjs');
  const run = (args, input) =>
    execFileSync('node', [script, ...args], { input, encoding: 'utf8', stdio: 'pipe' });

  it('reads changed paths from stdin and prints the job outputs', () => {
    const out = run([], 'packages/cli/README.md\npackages/cli/src/index.tsx\n');
    assert.match(out, /^cli=true$/m);
    assert.match(out, /^e2e=false$/m);
    assert.match(out, /^verify-packages=\["cli"\]$/m);
  });

  it('turns e2e on with an empty matrix for an e2e-only change', () => {
    const out = run([], 'packages/e2e/tests/lobby.spec.ts\n');
    assert.match(out, /^e2e=true$/m);
    assert.match(out, /^verify-packages=\[\]$/m);
  });

  it('prints every lane with --all', () => {
    const out = run(['--all'], '');
    assert.match(out, /^e2e=true$/m);
    assert.match(out, /^verify-packages=\["shared","relay","client","cli"\]$/m);
  });
});
