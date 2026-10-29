import { APP_VERSION } from './version';

/**
 * Production environment config.
 *
 * Single origin hnch.dev on Cloudflare (ADR-0051): Worker routes send
 * /health*, /rooms* and /ws/* to the relay (hnch-relay); everything else is
 * the static PWA (hnch-web). See docs/deployment.md.
 */
export const environment = {
  production: true,
  relayHttpUrl: 'https://hnch.dev',
  relayWsUrl: 'wss://hnch.dev',
  appVersion: APP_VERSION,
};
