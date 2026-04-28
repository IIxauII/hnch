// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

/**
 * Development environment config.
 *
 * The `relay*Url` constants point at the relay launched by the root
 * `pnpm dev` script (plan §2.6). Local dev expects the relay on
 * `localhost:1234`; production swaps in the deployed URLs via
 * `environment.prod.ts`.
 */
export const environment = {
  production: false,
  relayHttpUrl: 'http://localhost:1234',
  relayWsUrl: 'ws://localhost:1234',
  appBaseUrl: 'http://localhost:4200',
  appVersion: '1.1.1',
}

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
