/** The ADR-0027 test vars, for a suite that needs a non-production relay. */
export interface StartTestRelayOptions {
  /** `HNCH_ROOM_CAP`: lowers the participant cap (1–20). */
  roomCap?: number;
  /** `HNCH_ENABLE_TEST_ROUTES=1`: mounts `DELETE /test/rooms/:uuid` and `POST /test/rooms`. */
  testRoutes?: boolean;
}

export interface TestRelay {
  /** Base URL of the relay, e.g. `http://localhost:41234`. Serves `GET /health`. */
  httpUrl: string;
  /** The ws form of `httpUrl` (`ws://localhost:41234`). */
  wsUrl: string;
  /**
   * What the relay process has printed so far (stdout and stderr, warn level
   * and up): the last 256 Ki characters.
   */
  output(): string;
  /**
   * PID of the relay process (`scripts/dev.mjs`), which leads its own process
   * group: `process.kill(-pid, signal)` reaches wrangler and workerd too. For
   * tests of a relay dying without `stop()`.
   */
  pid: number;
  /** Resolves once the relay is down and its port refuses connections. */
  stop(): Promise<void>;
}

export function startTestRelay(opts?: StartTestRelayOptions): Promise<TestRelay>;
