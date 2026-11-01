/**
 * Deployed configuration, read from Worker vars (contract items 13 and 15).
 *
 * Vars are fixed per deployed version, so a value read here holds for the life
 * of the isolate. Production sets only `JURISDICTION` (wrangler.jsonc); the two
 * ADR-0027 test vars come from scripts/dev.mjs and the deploy job refuses a
 * config that sets them.
 */

import { MAX_ROOM_PARTICIPANTS } from '@hnch/shared/auth';

export interface RelayConfig {
  /** `'eu'` pins every Durable Object to the EU; `null` only in dev and tests. */
  readonly jurisdiction: 'eu' | null;
  /** Open sockets per room before the next is refused with 4006 (ADR-0024). */
  readonly roomCap: number;
  /** Whether the ADR-0027 test routes are mounted: `DELETE /test/rooms/:uuid` and `POST /test/rooms`. */
  readonly testRoutes: boolean;
  /** A lowered cap or mounted test routes: logged at WARN. */
  readonly nonProduction: boolean;
}

type ConfigVars = Pick<Env, 'JURISDICTION' | 'HNCH_ENABLE_TEST_ROUTES' | 'HNCH_ROOM_CAP'>;

export function readConfig(vars: ConfigVars): RelayConfig {
  const roomCap = parseRoomCap(vars.HNCH_ROOM_CAP);
  const testRoutes = vars.HNCH_ENABLE_TEST_ROUTES === '1';
  return {
    jurisdiction: vars.JURISDICTION === 'none' ? null : 'eu',
    roomCap,
    testRoutes,
    nonProduction: testRoutes || roomCap < MAX_ROOM_PARTICIPANTS,
  };
}

/** Lowers the cap only: a positive integer up to the production cap, else the cap. */
function parseRoomCap(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return MAX_ROOM_PARTICIPANTS;
  const parsed = Number(raw);
  return parsed >= 1 ? Math.min(parsed, MAX_ROOM_PARTICIPANTS) : MAX_ROOM_PARTICIPANTS;
}

let warned = false;
/** Vars are fixed for an isolate, so each env object is parsed once. */
const configs = new WeakMap<object, RelayConfig>();

/**
 * Reads the config and, the first time per isolate, warns if it is not the
 * production one, so a misconfigured deploy shows up in Workers Logs.
 */
export function configOf(env: ConfigVars): RelayConfig {
  const known = configs.get(env);
  if (known !== undefined) return known;
  const config = readConfig(env);
  configs.set(env, config);
  if (config.nonProduction && !warned) {
    warned = true;
    console.warn(
      JSON.stringify({
        ev: 'relay-config',
        roomCap: config.roomCap,
        testRoutes: config.testRoutes,
      }),
    );
  }
  return config;
}
