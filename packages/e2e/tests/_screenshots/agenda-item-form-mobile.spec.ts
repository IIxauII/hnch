/* eslint-disable max-lines-per-function -- linear capture tour; splitting obscures capture order */
/**
 * Screenshot capture for the agenda item form sheet at 375px.
 *
 * Writes PNGs to docs/screenshots/<sha>/agenda/ showing the sheet at the 0.6
 * breakpoint with the header actions visible (add mode and edit mode). The
 * regression guard for those actions (#446) runs in every e2e run from
 * `tests/sheet-actions-mobile.spec.ts`; the assertions kept here only wait
 * for the state the shots show.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/agenda-item-form-mobile.spec.ts
 */
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import { BASE_URL } from '../fixtures/helpers';
import {
  agendaItemActionMobile,
  freshMobileCtx,
  onboardMobile,
  createSessionMobile,
  openAgendaItemSheetMobile,
} from '../fixtures/open-sheet-375';

const OUT_DIR = resolveOutDir('agenda');
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

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
    const addBtn = sheet.getByRole('button', { name: 'Add story' });
    await expect(addBtn).toBeVisible({ timeout: 5_000 });

    // Confirm the button is also interactable (not just rendered off-screen).
    // The form is initially invalid (both title and ticketId empty), so the
    // button should be disabled — but still visible in the header.
    await expect(addBtn).toBeDisabled();

    // Cancel button must be visible too.
    const cancelBtn = sheet.getByRole('button', { name: 'Cancel' });
    await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

    // The rule is stated once, in plain words — not as an error that is on
    // screen before anything was typed.
    await expect(sheet).toContainText('A story needs a title or a ticket ID.');

    // Fill a title so the primary button becomes enabled.
    await sheet.getByRole('textbox', { name: 'Title' }).fill('Mobile story');
    await expect(addBtn).toBeEnabled({ timeout: 3_000 });

    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(OUT_DIR, '12-agenda-add-sheet-375px.png'),
      fullPage: false,
    });
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
    await sheet.getByRole('textbox', { name: 'Title' }).fill('Editable story');
    const addBtn = sheet.getByRole('button', { name: 'Add story' });
    await expect(addBtn).toBeEnabled({ timeout: 3_000 });
    await addBtn.click();
    await sheet.waitFor({ state: 'hidden', timeout: 15_000 });

    // The story is on the list, its actions behind the row's ⋯ button.
    const list = page.locator('app-agenda-panel ion-list.agenda-list');
    const firstItem = list.locator('ion-item.agenda-item').first();
    await firstItem.waitFor({ state: 'visible', timeout: 10_000 });
    await agendaItemActionMobile(page, 0, 'Edit');

    const editSheet = page.locator('app-agenda-item-form-sheet');
    await editSheet.waitFor({ state: 'visible', timeout: 10_000 });

    // Save button must be visible at the natural 0.6 breakpoint.
    const saveBtn = editSheet.getByRole('button', { name: 'Save story' });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    // Pre-filled form should be valid → Save enabled.
    await expect(saveBtn).toBeEnabled({ timeout: 3_000 });

    // Cancel button must be visible too.
    const cancelBtn = editSheet.getByRole('button', { name: 'Cancel' });
    await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(OUT_DIR, '13-agenda-edit-sheet-375px.png'),
      fullPage: false,
    });
  } finally {
    await ctx.close();
  }
});
