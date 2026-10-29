/**
 * The run's test relay, as the `relay` project's global setup
 * (`vitest.relay-setup.ts`) provides it to the suites. Outside `src/`, so the
 * package build never sees it; importing it is also what types
 * `inject('testRelayUrl')` for the suite and the setup.
 */

import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Base URL of the run's test relay, e.g. `http://localhost:41234`. */
    testRelayUrl: string;
  }
}

/** The `provide`/`inject` key the setup and the suites share. */
export type TestRelayUrlKey = 'testRelayUrl';

/** Base URL of the run's test relay, e.g. `http://localhost:41234`. */
export function testRelayUrl(): string {
  const url = inject('testRelayUrl');
  if (url === undefined) {
    throw new Error('no test relay: list this suite in RELAY_SUITES in vitest.config.ts');
  }
  return url;
}
