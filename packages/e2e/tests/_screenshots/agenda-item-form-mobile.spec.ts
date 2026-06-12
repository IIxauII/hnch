/* eslint-disable max-lines-per-function -- linear capture tour; splitting obscures capture order */
/**
 * Screenshot capture + regression guard for the agenda item form sheet at 375px.
 *
 * Regression guard (always runs):
 *   Asserts that the Add button (add mode) and Save button (edit mode) are
 *   visible and clickable at the 0.6 breakpoint on a 375px mobile viewport.
 *   This test FAILS on the old footer-based layout (button off-screen below
 *   the fold) and PASSES after the actions are relocated to the header toolbar
 *   (issue #446).
 *
 * Screenshot capture (opt-in via SCREENSHOT_CAPTURE=1):
 *   Writes PNGs to docs/screenshots/<sha>/agenda/ showing the sheet at the
 *   0.6 breakpoint with the header actions visible (add mode and edit mode).
 *
 * Run regression guard only:
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium tests/_screenshots/agenda-item-form-mobile.spec.ts
 *
 * Run with screenshot capture:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/agenda-item-form-mobile.spec.ts
 */
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import { BASE_URL } from '../fixtures/helpers';
import {
  freshMobileCtx,
  onboardMobile,
  createSessionMobile,
  openAgendaItemSheetMobile,
} from './_helpers/open-sheet-375';

const OUT_DIR = resolveOutDir('agenda');
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe.configure({ mode: 'serial' });

test('375px mobile — Add button visible and clickable in header (add mode) @host @layout', async ({
  browser,
}) => {
  test.setTimeout(90_000);

  const { ctx, page } = await freshMobileCtx(browser);

  try {
    await onboardMobile(page, BASE_URL);
    await createSessionMobile(page);

    const sheet = await openAgendaItemSheetMobile(page);

    // Primary regression guard: Add button must be visible at the natural
    // 0.6 breakpoint without any programmatic expansion. On the old footer
    // layout this assertion fails — the button is below the visible portion.
    const addBtn = sheet.getByRole('button', { name: 'Add agenda item' });
    await expect(addBtn).toBeVisible({ timeout: 5_000 });

    // Confirm the button is also interactable (not just rendered off-screen).
    // The form is initially invalid (both title and ticketId empty), so the
    // button should be disabled — but still visible in the header.
    await expect(addBtn).toBeDisabled();

    // Cancel button must be visible too.
    const cancelBtn = sheet.getByRole('button', { name: 'Cancel' });
    await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

    // Fill a title so the primary button becomes enabled.
    await page.getByRole('textbox', { name: 'Story title' }).fill('Mobile story');
    await expect(addBtn).toBeEnabled({ timeout: 3_000 });

    // Screenshot capture (opt-in only).
    if (process.env['SCREENSHOT_CAPTURE']) {
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(OUT_DIR, '12-agenda-add-sheet-375px.png'),
        fullPage: false,
      });
    }
  } finally {
    await ctx.close();
  }
});

test('375px mobile — Save button visible and clickable in header (edit mode) @host @layout', async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const { ctx, page } = await freshMobileCtx(browser);

  try {
    await onboardMobile(page, BASE_URL, 'MobileHostEdit');
    await createSessionMobile(page);

    // Add an item first so we can open the edit sheet.
    const sheet = await openAgendaItemSheetMobile(page);
    await page.getByRole('textbox', { name: 'Story title' }).fill('Editable story');
    const addBtn = sheet.getByRole('button', { name: 'Add agenda item' });
    await expect(addBtn).toBeEnabled({ timeout: 3_000 });
    await addBtn.click();
    await sheet.waitFor({ state: 'hidden', timeout: 15_000 });

    // After dismiss the mobile panel is collapsed again — a "Next up" chip now
    // shows the item we just added. Expand the panel via the chip so the
    // host-only Edit button (inside the expanded list) is reachable.
    const nextUpChip = page.locator('app-agenda-panel ion-chip.next-up-chip');
    await nextUpChip.waitFor({ state: 'visible', timeout: 10_000 });
    await nextUpChip.click();

    // Now open the edit sheet for the item we just added.
    const list = page.locator('app-agenda-panel ion-list.agenda-list');
    const firstItem = list.locator('ion-item.agenda-item').first();
    await firstItem.waitFor({ state: 'visible', timeout: 10_000 });
    const editBtn = firstItem.getByRole('button', { name: /^Edit /u });
    await editBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await editBtn.click();

    const editSheet = page.locator('app-agenda-item-form-sheet');
    await editSheet.waitFor({ state: 'visible', timeout: 10_000 });

    // Save button must be visible at the natural 0.6 breakpoint.
    const saveBtn = editSheet.getByRole('button', { name: 'Save agenda item' });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    // Pre-filled form should be valid → Save enabled.
    await expect(saveBtn).toBeEnabled({ timeout: 3_000 });

    // Cancel button must be visible too.
    const cancelBtn = editSheet.getByRole('button', { name: 'Cancel' });
    await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

    // Screenshot capture (opt-in only).
    if (process.env['SCREENSHOT_CAPTURE']) {
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(OUT_DIR, '13-agenda-edit-sheet-375px.png'),
        fullPage: false,
      });
    }
  } finally {
    await ctx.close();
  }
});
