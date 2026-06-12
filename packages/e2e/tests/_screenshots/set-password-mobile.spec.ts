/* eslint-disable max-lines-per-function -- linear capture tour; splitting obscures capture order */
/**
 * Regression guard for the set-password sheet at 375px.
 *
 * Asserts that:
 *   - The Confirm button is visible and clickable at the 0.6 breakpoint.
 *   - Exactly ONE Cancel button is present (de-duplication: the old layout
 *     had Cancel in header slot="end" AND Cancel + Confirm in footer).
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

test('375px mobile — Confirm visible and clickable, only one Cancel @host @layout', async ({
  browser,
}) => {
  test.setTimeout(90_000);

  const { ctx, page } = await freshMobileCtx(browser);

  try {
    await onboardMobile(page, BASE_URL);
    const sheet = await openSetPasswordSheetMobile(page, BASE_URL);

    // Primary regression guard: Confirm must be visible at the natural 0.6
    // breakpoint without any programmatic expansion. On the old footer layout
    // this assertion fails — the button is below the visible portion.
    const confirmBtn = sheet.getByRole('button', { name: 'Confirm' });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });

    // Confirm the button is also interactable (not just rendered off-screen).
    await expect(confirmBtn).toBeEnabled();

    // De-duplication guard: exactly ONE Cancel button must be present.
    // The old layout had Cancel in header slot="end" AND Cancel in footer —
    // two Cancels. After the fix there is only one (header slot="start").
    const cancelBtns = sheet.getByRole('button', { name: 'Cancel' });
    await expect(cancelBtns).toHaveCount(1);
    await expect(cancelBtns.first()).toBeVisible({ timeout: 5_000 });
  } finally {
    await ctx.close();
  }
});
