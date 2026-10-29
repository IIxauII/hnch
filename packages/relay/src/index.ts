/**
 * hnch relay on Cloudflare Workers + Durable Objects (ADR-0051).
 *
 * Content-blind y-websocket relay (ADR-0001): it forwards opaque Yjs updates
 * and awareness states and never parses them. Wire protocol, REST shape and
 * close codes are those of the Node relay it replaces (ADR-0016, ADR-0024,
 * ADR-0035, ADR-0050).
 */

import { handleFetch, handleScheduled } from './worker';

export default {
  fetch: (request, env) => handleFetch(request, env),
  scheduled: (controller, env) => handleScheduled(controller, env),
} satisfies ExportedHandler<Env>;

export { Room } from './room';
export { Codes } from './codes';
export { Expiry } from './expiry';
