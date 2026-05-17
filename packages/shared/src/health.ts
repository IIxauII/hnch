/**
 * Operator-facing response shape for `GET /health` on the relay.
 *
 * All fields are aggregate counters — no room UUIDs, codes, participant IDs,
 * or session content. The relay stays content-blind (ADR-0001) and the
 * endpoint is outside ADR-0028's user-telemetry scope.
 */
export interface HealthResponse {
  readonly status: 'ok';
  readonly version: string;
  readonly uptime: number;
  readonly rooms: {
    readonly active: number;
    readonly snapshotted: number;
    readonly cap: number;
  };
  readonly peers: {
    readonly connected: number;
  };
}
