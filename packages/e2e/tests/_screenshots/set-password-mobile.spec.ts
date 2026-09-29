/* eslint-disable max-lines-per-function -- linear capture tour; splitting obscures capture order */
/**
 * Regression guard for the session-password sheet at 375px.
 *
 * Asserts that:
 *   - The Done button is visible and clickable at the 0.6 breakpoint.
 *   - Exactly ONE way out without a password is present (de-duplication: the
 *     old layout had Cancel in header slot="end" AND Cancel + Confirm in
 *     footer). It reads "Skip": the session exists either way, so the button
 *     skips the password, it does not cancel anything.
 *
 * This test FAILS on the old footer-based layout (button off-screen / two
 * Cancels visible) and PASSES after the actions are collapsed to the header
 * toolbar (issue #448).
 *
 * Run regression guard only:
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium tests/_screenshots/set-password-mobile.spec.ts
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from '../fixtures/helpers';
import {
  freshMobileCtx,
  onboardMobile,
  openSetPasswordSheetMobile,
} from './_helpers/open-sheet-375';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe.configure({ mode: 'serial' });

test('375px mobile — Done visible and clickable, only one Skip @host @layout', async ({
  browser,
}) => {
  test.setTimeout(90_000);

  const { ctx, page } = await freshMobileCtx(browser);

  try {
    await onboardMobile(page, BASE_URL);
    const sheet = await openSetPasswordSheetMobile(page, BASE_URL);

    // Primary regression guard: Done must be visible at the natural 0.6
    // breakpoint without any programmatic expansion. On the old footer layout
    // this assertion fails — the button is below the visible portion.
    const doneBtn = sheet.getByRole('button', { name: 'Done', exact: true });
    await expect(doneBtn).toBeVisible({ timeout: 5_000 });

    // Confirm the button is also interactable (not just rendered off-screen).
    await expect(doneBtn).toBeEnabled();

    // De-duplication guard: exactly ONE Skip button must be present, and no
    // Cancel beside it. The old layout had Cancel in header slot="end" AND
    // Cancel in footer. After the fix there is only one (header slot="start").
    const skipBtns = sheet.getByRole('button', { name: 'Skip', exact: true });
    await expect(skipBtns).toHaveCount(1);
    await expect(skipBtns.first()).toBeVisible({ timeout: 5_000 });
    await expect(sheet.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

    // Skip creates the session all the same — it is not orphaned.
    await skipBtns.first().click();
    await page.waitForURL(/\/lobby/, { timeout: 15_000 });
    await expect(page.locator('button.room-code')).toBeVisible();
  } finally {
    await ctx.close();
  }
});
