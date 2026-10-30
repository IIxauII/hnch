// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { APP_VERSION } from './version';

/**
 * Development environment config.
 *
 * `relayHttpUrl`/`relayWsUrl` are derived at module load from
 * `window.location.port` so that each worktree (running on a different
 * client port) automatically targets its own relay instance.
 *
 * Convention: RELAY_PORT = 1234 + (CLIENT_PORT - 4200).
 * Bootstrap enforces this offset. `environment.prod.ts` (production) keeps
 * fully hardcoded `https://hnch.dev` URLs — this derive code never runs in
 * prod because Angular's `fileReplacements` swaps the whole file at build
 * time. The `e2e` build configuration (CI Playwright runs, #602) has no
 * replacement, so its optimised bundle keeps this file and reaches the test
 * relay on the CI ports.
 */
const clientPort = parseInt(window.location.port || '4200', 10);
let relayPort = 1234 + (clientPort - 4200);
if (!Number.isFinite(relayPort) || relayPort < 1 || relayPort > 65535) relayPort = 1234;
const host = window.location.hostname || 'localhost';

// Dev assumes HTTP/WS; HTTPS tunnels (ngrok, `ng serve --ssl`) will hit mixed-content errors.
export const environment = {
  production: false,
  relayHttpUrl: `http://${host}:${relayPort}`,
  relayWsUrl: `ws://${host}:${relayPort}`,
  appVersion: APP_VERSION,
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
