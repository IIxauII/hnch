/**
 * Where the CLI's source lives, said in `--help` and `--version`.
 *
 * hnch is AGPL-3.0-only. Section 13 asks anyone who runs a modified copy to
 * offer its users the source; pointing at it here means a fork inherits that
 * offer and only has to change the URL.
 */

import type { Argv } from 'yargs';

export const SOURCE_URL = 'https://github.com/IIxauII/hnch';
export const LICENSE_ID = 'AGPL-3.0-only';

/** Set by tsup from package.json at build time; absent under tsx and vitest. */
declare const __HNCH_CLI_VERSION__: string | undefined;

/** The published version, or `dev` when run from source. */
export const CLI_VERSION = typeof __HNCH_CLI_VERSION__ === 'string' ? __HNCH_CLI_VERSION__ : 'dev';

/** Give `--version` and `--help` the version, the source link and the license. */
export function withAbout<T>(cli: Argv<T>, version: string): Argv<T> {
  return cli
    .version(`${version}\nSource code: ${SOURCE_URL} (${LICENSE_ID})`)
    .epilogue(`Source code: ${SOURCE_URL}\nLicense: ${LICENSE_ID}`);
}
