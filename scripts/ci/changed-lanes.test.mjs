// Tests for scripts/ci/changed-lanes.mjs. node:test, not vitest: the
// detect-changes job runs them before it trusts the script, and it has no
// node_modules. Run locally with `pnpm test:ci-scripts`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { allLanes, changedLanes, formatOutputs } from './changed-lanes.mjs';

const lanesOf = (files) => changedLanes(files).verifyPackages;

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
    assert.deepEqual(verifyPackages, ['shared', 'relay', 'cli', 'e2e']);
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
    assert.deepEqual(lanesOf(['packages/client/README.md', 'packages/client/src/main.ts']), [
      'client',
      'e2e',
    ]);
  });

  it('still counts Markdown nested inside a package', () => {
    assert.deepEqual(lanesOf(['packages/client/src/assets/notes.md']), ['client', 'e2e']);
  });

  it('starts no lane for root or docs Markdown', () => {
    assert.deepEqual(lanesOf(['README.md', 'CONTRIBUTING.md', 'docs/ux.md', 'adr/0001-x.md']), []);
  });

  it('starts no lane for an empty change list', () => {
    assert.deepEqual(lanesOf(['']), []);
  });

  it('runs every lane for a root file', () => {
    for (const f of [
      'pnpm-lock.yaml',
      'package.json',
      'tsconfig.base.json',
      '.github/workflows/ci.yml',
    ]) {
      const { lanes, verifyPackages } = changedLanes([f]);
      assert.equal(lanes.root, true, f);
      assert.deepEqual(verifyPackages, ['shared', 'relay', 'client', 'cli', 'e2e'], f);
    }
  });

  it('fans a shared change out to every lane', () => {
    assert.deepEqual(lanesOf(['packages/shared/src/index.ts']), [
      'shared',
      'relay',
      'client',
      'cli',
      'e2e',
    ]);
  });

  it('keeps a CLI change to the CLI lane', () => {
    assert.deepEqual(lanesOf(['packages/cli/src/index.tsx']), ['cli']);
  });

  it('runs e2e alone for an e2e spec change', () => {
    assert.deepEqual(lanesOf(['packages/e2e/tests/lobby.spec.ts']), ['e2e']);
  });

  it('runs the relay and client lanes for the shared deploy-guard helpers', () => {
    assert.deepEqual(lanesOf(['scripts/cloudflare/worker-guard.mjs']), [
      'shared',
      'relay',
      'client',
      'cli',
      'e2e',
    ]);
  });

  it('runs the relay lane for its stall sampler, not for the rest of scripts/ci', () => {
    assert.deepEqual(lanesOf(['scripts/ci/with-stall-sampler.sh']), [
      'shared',
      'relay',
      'cli',
      'e2e',
    ]);
    assert.deepEqual(lanesOf(['scripts/ci/changed-lanes.mjs']), []);
  });
});

describe('allLanes', () => {
  it('turns every lane on', () => {
    assert.deepEqual(allLanes().lanes, {
      shared: true,
      relay: true,
      client: true,
      cli: true,
      e2e: true,
      root: true,
    });
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

  it('prints every lane with --all', () => {
    assert.match(
      run(['--all'], ''),
      /^verify-packages=\["shared","relay","client","cli","e2e"\]$/m,
    );
  });
});
