/** The ADR-0027 test vars, for a suite that needs a non-production relay. */
export interface StartTestRelayOptions {
  /** `HNCH_ROOM_CAP`: lowers the participant cap (1–20). */
  roomCap?: number;
  /** `HNCH_ENABLE_TEST_ROUTES=1`: mounts `DELETE /test/rooms/:uuid`. */
  testRoutes?: boolean;
}

export interface TestRelay {
  /** Base URL of the relay, e.g. `http://localhost:41234`. Serves `GET /health`. */
  httpUrl: string;
  /** The ws form of `httpUrl` (`ws://localhost:41234`). */
  wsUrl: string;
  /** Everything the relay process has printed so far (stdout and stderr, warn level and up). */
  output(): string;
  /** Resolves once the relay is down and its port refuses connections. */
  stop(): Promise<void>;
}

export function startTestRelay(opts?: StartTestRelayOptions): Promise<TestRelay>;
