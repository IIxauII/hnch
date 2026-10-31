// Exercises: about:withAbout (the source-code offer in --help and --version, AGPL-3.0 section 13), about:CLI_VERSION

import yargs from 'yargs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withAbout } from './about.js';

describe('CLI_VERSION', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('is the version tsup builds in', async () => {
    vi.stubGlobal('__HNCH_CLI_VERSION__', '1.17.2');
    vi.resetModules();
    const { CLI_VERSION } = await import('./about.js');
    expect(CLI_VERSION).toBe('1.17.2');
  });

  it('is dev when run from source', async () => {
    vi.resetModules();
    const { CLI_VERSION } = await import('./about.js');
    expect(CLI_VERSION).toBe('dev');
  });
});

/** Run one parse with yargs' own output captured instead of printed. */
async function output(flag: string): Promise<string> {
  const cli = withAbout(yargs([]).scriptName('hnch').exitProcess(false), '1.17.2');
  return new Promise((resolve, reject) => {
    void cli.parse(flag, {}, (err, _argv, out) => (err ? reject(err) : resolve(out)));
  });
}

describe('withAbout', () => {
  it('prints the version and where the source is on --version', async () => {
    expect(await output('--version')).toBe(
      '1.17.2\nSource code: https://github.com/IIxauII/hnch (AGPL-3.0-only)',
    );
  });

  it('ends --help with the source link and the license', async () => {
    const help = await output('--help');
    expect(help).toMatch(
      /Source code: https:\/\/github\.com\/IIxauII\/hnch\nLicense: AGPL-3\.0-only$/,
    );
  });
});
