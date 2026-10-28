/**
 * Response shape for `GET /health` on the relay.
 *
 * Shallow by design (ADR-0051): the relay answers without touching a room, so
 * there are no counts and no config or gate state — only that it is up and
 * which release is serving.
 */
export interface HealthResponse {
  readonly status: 'ok';
  /** `packages/relay/package.json#version` of the deployed relay. */
  readonly version: string;
}
