/**
 * Addressing the three Durable Object kinds (ADR-0051):
 *
 *   Room(uuid)       one per room, by lowercase UUID
 *   Codes(code)      one per room code, by normalised code
 *   Expiry(day)      one per UTC creation day, `YYYY-MM-DD`
 *
 * Every object lives in the configured jurisdiction (EU in production).
 */

import { configOf } from './config';

function inJurisdiction<T extends Rpc.DurableObjectBranded | undefined>(
  env: Env,
  namespace: DurableObjectNamespace<T>,
): DurableObjectNamespace<T> {
  const { jurisdiction } = configOf(env);
  return jurisdiction === null ? namespace : namespace.jurisdiction(jurisdiction);
}

export function roomStub(env: Env, uuid: string) {
  const ns = inJurisdiction(env, env.ROOM);
  return ns.get(ns.idFromName(uuid.toLowerCase()));
}

export function codesStub(env: Env, code: string) {
  const ns = inJurisdiction(env, env.CODES);
  return ns.get(ns.idFromName(code));
}

export function expiryStub(env: Env, day: string) {
  const ns = inJurisdiction(env, env.EXPIRY);
  return ns.get(ns.idFromName(day));
}

/** The UTC calendar day of `ms`, as `YYYY-MM-DD`. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Content-free log line (contract item 17): an event name and, for a failure,
 * the error's class. Never a room UUID, code, URL or payload.
 *
 * An error's message is logged only when the platform raised it (Durable
 * Object errors carry `retryable`, `overloaded` or `remote`). Other messages
 * can quote input: a JSON parse error repeats the text it choked on.
 */
export function logEvent(ev: string, err?: unknown): void {
  if (err === undefined) {
    console.error(JSON.stringify({ ev }));
    return;
  }
  const error = err instanceof Error ? err.name : typeof err;
  const platform =
    err instanceof Error && ('retryable' in err || 'overloaded' in err || 'remote' in err);
  console.error(
    JSON.stringify(platform ? { ev, error, detail: err.message.slice(0, 200) } : { ev, error }),
  );
}
