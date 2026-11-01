/**
 * The `test` every screenshot spec imports, in place of Playwright's own.
 *
 * Two captures of one tree must write byte-identical PNGs (#762), so whatever
 * the app would pick at random is pinned here, per browser context the test
 * opens (through `browser.newContext()` or the built-in `context`/`page`):
 *
 * - **Device ID.** Seeded into the participant-ID slot before the app loads,
 *   from the context's position in the test (first context opened, second…).
 *   The avatar colour, the participant order on ties and the host election
 *   all follow from it.
 * - **Room code.** The context's `POST /rooms` goes to the relay's test-only
 *   `POST /test/rooms` (ADR-0027 gate) with a code derived from the test's
 *   title path, the context's position and how many rooms it has made.
 * - **Elapsed labels.** `window.__captureElapsedMs` makes the stopwatch and
 *   every round duration read `0:00` (packages/client/src/app/core/elapsed-label.ts).
 * - **Confetti.** `window.__confettiRng` (seeded; a spec may set its own seed)
 *   picks the pattern and particles, and `window.__confettiFreezeMs` draws the
 *   burst as it stands 500 ms in, held still (confetti-engine.ts).
 * - **Ionic motion.** `window.Ionic.config.animated = false`, read by Ionic at
 *   boot: pages and overlays appear without their slide or scale-in. A popover
 *   that scaled in kept its icons drawn at a mid-animation scale, a few pixels
 *   off from one run to the next.
 * - **Motion and hover.** Before every `page.screenshot()` the pointer leaves
 *   the page (where the last click left it, a button slid under it may or may
 *   not show hover) and the page's finite animations run out, so no shot
 *   catches a menu or sheet mid-slide, or an icon drawn at a mid-slide scale.
 *   The shot itself defaults to `animations: 'disabled'`, which ends any still
 *   running and sets infinite ones (a spinner) to their start.
 *
 * App specs never import this, so nothing is pinned outside capture.
 * To pin another source, add it to `pinContext` below and name it in
 * packages/e2e/README.md › Screenshot harness › Pinned sources.
 */
import { createHash } from 'node:crypto';
import { test as base, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

export { expect } from '@playwright/test';

/** Room-code alphabet (ADR-0008, packages/shared/src/room-code.ts). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Where the app keeps its participant ID (Capacitor Preferences on the web). */
const PARTICIPANT_ID_KEY = 'CapacitorStorage.hnch.participantId';

/** A fixed UUID per context position: the first context of every test is the same device. */
export function pinnedDeviceId(contextIndex: number): string {
  const hex = createHash('sha256').update(`hnch-capture-device-${contextIndex}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The code of a context's `roomIndex`-th room in the test at `titlePath`. */
export function pinnedRoomCode(
  titlePath: readonly string[],
  contextIndex: number,
  roomIndex: number,
): string {
  const bytes = createHash('sha256')
    .update(JSON.stringify([titlePath, contextIndex, roomIndex]))
    .digest();
  return Array.from(bytes.subarray(0, 6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/**
 * Waits, up to 5 s, until no finite animation or transition is running. A
 * zero-rate one is a frozen confetti particle and counts as done. Past the
 * limit the shot goes ahead: `animations: 'disabled'` still ends what runs.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const end = a.effect?.getComputedTiming().endTime;
          return a.playState !== 'running' || a.playbackRate === 0 || !Number.isFinite(end);
        }),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
}

let warnedUnpinned = false;
function warnUnpinnedCodes(): void {
  if (warnedUnpinned) return;
  warnedUnpinned = true;
  console.warn(
    'capture-test: the relay has no test routes (HNCH_ENABLE_TEST_ROUTES=1), so room codes are random in this run and its PNGs will not match another capture.',
  );
}

/** How far into the confetti burst a shot shows it (the reveal specs wait this long). */
const CONFETTI_FREEZE_MS = 500;

async function pinContext(ctx: BrowserContext, testInfo: TestInfo, index: number): Promise<void> {
  await ctx.addInitScript(
    ({ key, id, freezeMs }) => {
      const w = window as {
        Ionic?: { config?: Record<string, unknown> };
        __captureElapsedMs?: number;
        __confettiFreezeMs?: number;
        __confettiRng?: () => number;
      };
      w.Ionic = { ...w.Ionic, config: { ...w.Ionic?.config, animated: false } };
      w.__captureElapsedMs = 0;
      w.__confettiFreezeMs = freezeMs;
      // The LCG the reveal specs seed; a page-level init script runs later and wins.
      let seed = 1;
      w.__confettiRng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, id);
      } catch {
        // about:blank and other opaque origins have no storage.
      }
    },
    { key: PARTICIPANT_ID_KEY, id: pinnedDeviceId(index), freezeMs: CONFETTI_FREEZE_MS },
  );

  ctx.on('page', (page) => {
    const screenshot = page.screenshot.bind(page);
    page.screenshot = async (options) => {
      await page.mouse.move(-1, -1);
      await settleAnimations(page);
      return screenshot({ animations: 'disabled', ...options });
    };
  });

  let rooms = 0;
  await ctx.route(
    (url) => url.pathname === '/rooms',
    async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.fallback();
      const code = pinnedRoomCode(testInfo.titlePath, index, rooms++);
      const body = { ...(request.postDataJSON() as Record<string, unknown> | null), code };
      const response = await route.fetch({
        url: new URL('/test/rooms', request.url()).href,
        postData: JSON.stringify(body),
      });
      // A relay without test routes (a plain `pnpm dev:relay` reused locally):
      // the session still opens, with a random code.
      if (response.status() === 404) {
        warnUnpinnedCodes();
        return route.continue();
      }
      return route.fulfill({ response });
    },
  );
}

export const test = base.extend<{ capturePins: void }>({
  capturePins: [
    async ({ browser }, use, testInfo) => {
      let next = 0;
      const original = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        // Numbered at the call, so contexts opened together keep their order.
        const index = next++;
        const ctx = await original(options);
        await pinContext(ctx, testInfo, index);
        return ctx;
      };
      await use();
      browser.newContext = original;
    },
    { auto: true },
  ],
});
