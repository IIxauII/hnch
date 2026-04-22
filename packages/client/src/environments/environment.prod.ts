/**
 * Production environment config.
 *
 * The `relay*Url` constants point at the deployed relay. Until we have
 * real deploy targets these fall back to the localhost defaults from
 * `environment.ts`; override at build time through `angular.json`'s
 * `fileReplacements` once the relay is hosted.
 */
export const environment = {
  production: true,
  relayHttpUrl: 'http://localhost:1234',
  relayWsUrl: 'ws://localhost:1234',
  appBaseUrl: 'https://hnch.app',
}
