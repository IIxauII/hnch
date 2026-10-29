/**
 * Bindings and vars from wrangler.jsonc, plus the overrides scripts/dev.mjs and
 * the test config pass. Kept by hand: the set is small and `wrangler types`
 * would add a generated file to keep in sync.
 */
declare namespace Cloudflare {
  interface Env {
    readonly ROOM: DurableObjectNamespace<import('./room').Room>;
    readonly CODES: DurableObjectNamespace<import('./codes').Codes>;
    readonly EXPIRY: DurableObjectNamespace<import('./expiry').Expiry>;
    /** `"eu"` in wrangler.jsonc. Only `"none"` turns the pin off (dev, tests). */
    readonly JURISDICTION?: string;
    /** ADR-0027: `"1"` mounts the test-only routes. Never set in wrangler.jsonc. */
    readonly HNCH_ENABLE_TEST_ROUTES?: string;
    /** ADR-0027: lowers the participant cap. Never set in wrangler.jsonc. */
    readonly HNCH_ROOM_CAP?: string;
  }
  interface GlobalProps {
    mainModule: typeof import('./index');
  }
}

interface Env extends Cloudflare.Env {}
