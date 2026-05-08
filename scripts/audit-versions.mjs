#!/usr/bin/env node
// Audits package.json versions for the four releasable packages against
// the highest existing git tag for each package. semantic-release writes
// the placeholder back to package.json after each release; humans should
// never hand-bump these.
//
// Invariants per package:
//   - If a tag `<pkg>-v<semver>` exists: package.json.version MUST match.
//   - If no tag exists yet: package.json.version MUST equal the placeholder
//     "0.0.0-semantically-released".
//
// Exits 0 on success, 1 on any mismatch (with a readable diff).

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const __dirname = import.meta.dirname;
const repoRoot = resolve(__dirname, '..');

const PLACEHOLDER = '0.0.0-semantically-released';
const PACKAGES = ['shared', 'relay', 'client', 'cli'];

/**
 * Compare two semver-ish strings (X.Y.Z, prerelease parts ignored beyond a
 * stable lexicographic compare). Returns positive if a > b, negative if a < b,
 * 0 if equal. Good enough for picking the highest tag from a known package's
 * tag list.
 */
function compareSemver(a, b) {
  const splitFn = (s) => {
    const [base, pre = ''] = s.split('-');
    const nums = base.split('.').map((n) => Number.parseInt(n, 10));
    return { nums, pre };
  };
  const aa = splitFn(a);
  const bb = splitFn(b);
  for (let i = 0; i < 3; i++) {
    const an = aa.nums[i] ?? 0;
    const bn = bb.nums[i] ?? 0;
    if (an !== bn) return an - bn;
  }
  // Stable: a release (no prerelease) is greater than any prerelease.
  if (aa.pre === '' && bb.pre !== '') return 1;
  if (aa.pre !== '' && bb.pre === '') return -1;
  if (aa.pre < bb.pre) return -1;
  if (aa.pre > bb.pre) return 1;
  return 0;
}

function highestTagVersion(pkg) {
  let raw;
  try {
    raw = execSync(`git tag --list "${pkg}-v*"`, {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    throw new Error(`git tag --list failed for ${pkg}: ${err.message}`, { cause: err });
  }
  const versions = raw
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(new RegExp(`^${pkg}-v`), ''))
    .filter((v) => /^\d+\.\d+\.\d+/.test(v));
  if (versions.length === 0) return null;
  return versions.toSorted(compareSemver).at(-1);
}

function readPkgVersion(pkg) {
  const pkgJsonPath = resolve(repoRoot, 'packages', pkg, 'package.json');
  const json = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  return { version: json.version, path: pkgJsonPath };
}

function main() {
  const failures = [];
  const lines = [];

  for (const pkg of PACKAGES) {
    const tagVersion = highestTagVersion(pkg);
    const { version: pkgVersion, path } = readPkgVersion(pkg);

    if (tagVersion === null) {
      // Pre-first-release: must be the placeholder.
      if (pkgVersion === PLACEHOLDER) {
        lines.push(`  ok   ${pkg}: no tags yet, placeholder OK (${pkgVersion})`);
      } else {
        failures.push({
          pkg,
          path,
          expected: PLACEHOLDER,
          actual: pkgVersion,
          reason: `no '${pkg}-v*' tag exists yet — version must be the placeholder until first release`,
        });
      }
      continue;
    }

    if (pkgVersion === PLACEHOLDER) {
      // Released at least once but placeholder not restored — semantic-release
      // should have committed `version: <tagVersion>` back, but until that lands
      // the placeholder is stale. Hard fail.
      failures.push({
        pkg,
        path,
        expected: tagVersion,
        actual: pkgVersion,
        reason: `latest tag is '${pkg}-v${tagVersion}' but package.json still has the placeholder; the post-release commit is missing`,
      });
      continue;
    }

    if (pkgVersion === tagVersion) {
      lines.push(`  ok   ${pkg}: matches latest tag '${pkg}-v${tagVersion}'`);
    } else {
      failures.push({
        pkg,
        path,
        expected: tagVersion,
        actual: pkgVersion,
        reason: `latest tag is '${pkg}-v${tagVersion}' but package.json has '${pkgVersion}' — do not hand-bump`,
      });
    }
  }

  if (lines.length > 0) {
    console.log('Version audit:');
    for (const line of lines) console.log(line);
  }

  if (failures.length === 0) {
    console.log('\nAll four releasable packages are in sync.');
    process.exit(0);
  }

  console.error('\nVersion audit FAILED:\n');
  for (const f of failures) {
    console.error(`  pkg:      ${f.pkg}`);
    console.error(`  file:     ${f.path}`);
    console.error(`  expected: ${f.expected}`);
    console.error(`  actual:   ${f.actual}`);
    console.error(`  reason:   ${f.reason}\n`);
  }
  console.error(
    'Versions are managed by semantic-release. Do not edit ' +
      'packages/<pkg>/package.json `version` by hand. Reset it to ' +
      `"${PLACEHOLDER}" (pre-first-release) or to the latest tag.`,
  );
  process.exit(1);
}

main();
