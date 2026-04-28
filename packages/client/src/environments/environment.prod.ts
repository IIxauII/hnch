/**
 * Production environment config.
 *
 * Relay is hosted at hnch.dev per ADR-0029 (single-origin: PWA + relay on
 * one VPS, fronted by Caddy with auto-TLS). Caddy routes /rooms* and /ws*
 * to the relay on 127.0.0.1:1234; everything else is served as static PWA.
 */
export const environment = {
  production: true,
  relayHttpUrl: 'https://hnch.dev',
  relayWsUrl: 'wss://hnch.dev',
  appBaseUrl: 'https://hnch.dev',
  appVersion: '0.1.0',
}
