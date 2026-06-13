/**
 * Regression guard for the round-edit sheet Save action placement at 375px.
 *
 * Asserts that the Save button is visible and clickable at the `0.6`
 * breakpoint on a 375px mobile viewport. This test FAILS on the old
 * footer-based layout (button off-screen below the fold) and PASSES
 * after the Save action is relocated to the header toolbar (issue #447).
 *
 * No screenshot capture — the PRD (issue #444) does not require a mobile
 * screenshot for this sheet (only round-start and agenda get 375px captures).
 *
 * Run:
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium tests/_screenshots/round-edit-mobile.spec.ts
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from '../fixtures/helpers';
import {
  freshMobileCtx,
  onboardMobile,
  createSessionMobile,
  openRoundEditSheetMobile,
} from './_helpers/open-sheet-375';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe.configure({ mode: 'serial' });

test('375px mobile — Save button visible and clickable in header @host @layout', async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const { ctx, page } = await freshMobileCtx(browser);

  try {
    await onboardMobile(page, BASE_URL);
    await createSessionMobile(page);

    const sheet = await openRoundEditSheetMobile(page);

    // Primary regression guard: Save button must be visible at the natural
    // 0.6 breakpoint without any programmatic expansion. On the old footer
    // layout this assertion fails — the button is below the visible portion.
    const saveBtn = sheet.getByRole('button', { name: 'Save round details' });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    // Confirm the button is also interactable (not just rendered off-screen).
    // The title is pre-filled so the disabled guard does not block the check.
    await expect(saveBtn).toBeEnabled();
  } finally {
    await ctx.close();
  }
});
