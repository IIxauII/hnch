/** Reserved: Phase 1b adds the ADR-0027 test vars here. */
export interface StartTestRelayOptions {}

export interface TestRelay {
  /** Base URL of the relay, e.g. `http://localhost:41234`. Serves `GET /health`. */
  httpUrl: string;
  /** The ws form of `httpUrl` (`ws://localhost:41234`). */
  wsUrl: string;
  /** Resolves once the relay is down and its port refuses connections. */
  stop(): Promise<void>;
}

export function startTestRelay(opts?: StartTestRelayOptions): Promise<TestRelay>;
