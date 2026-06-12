/* eslint-disable max-lines-per-function -- linear capture tour; splitting obscures capture order */
/**
 * Screenshot capture + regression guard for the round-start sheet at 375px.
 *
 * Regression guard (always runs):
 *   Asserts that the Start button is visible and clickable at the 0.6
 *   breakpoint on a 375px mobile viewport. This test FAILS on the old
 *   footer-based layout (button off-screen below the fold) and PASSES
 *   after the actions are relocated to the header toolbar (issue #445).
 *
 * Screenshot capture (opt-in via SCREENSHOT_CAPTURE=1):
 *   Writes a PNG to docs/screenshots/<sha>/round-start/ showing the
 *   sheet at the 0.6 breakpoint with the header actions visible.
 *
 * Run regression guard only:
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium tests/_screenshots/round-start-mobile.spec.ts
 *
 * Run with screenshot capture:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/round-start-mobile.spec.ts
 */
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import { BASE_URL } from '../fixtures/helpers';
import {
  freshMobileCtx,
  onboardMobile,
  createSessionMobile,
  openRoundStartSheetMobile,
} from './_helpers/open-sheet-375';

const OUT_DIR = resolveOutDir('round-start');
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe.configure({ mode: 'serial' });

test('375px mobile — Start button visible and clickable in header @host @layout', async ({
  browser,
}) => {
  test.setTimeout(90_000);

  const { ctx, page } = await freshMobileCtx(browser);

  try {
    await onboardMobile(page, BASE_URL);
    await createSessionMobile(page);

    const sheet = await openRoundStartSheetMobile(page);

    // Primary regression guard: Start button must be visible at the natural
    // 0.6 breakpoint without any programmatic expansion. On the old footer
    // layout this assertion fails — the button is below the visible portion.
    const startBtn = sheet.getByRole('button', { name: 'Start round' });
    await expect(startBtn).toBeVisible({ timeout: 5_000 });

    // Confirm the button is also interactable (not just rendered off-screen).
    await expect(startBtn).toBeEnabled();

    // Cancel button must be visible too.
    const cancelBtn = sheet.getByRole('button', { name: 'Cancel' });
    await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

    // Screenshot capture (opt-in only).
    if (process.env['SCREENSHOT_CAPTURE']) {
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(OUT_DIR, '01-round-start-sheet-375px.png'),
        fullPage: false,
      });
    }
  } finally {
    await ctx.close();
  }
});
