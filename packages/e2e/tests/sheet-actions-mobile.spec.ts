/**
 * Half-sheet actions at 375px: the primary and dismiss buttons sit in the
 * header toolbar, visible and clickable at the sheet's natural 0.6
 * breakpoint without expanding it. On the old footer layout they were below
 * the fold.
 *
 *   - round-start sheet (#445)
 *   - story form sheet, add + edit mode (#446)
 *   - round-edit sheet (#447)
 *   - session-password sheet (#448), incl. only one way out (Skip)
 *
 * These guards used to live under `_screenshots/`. They moved here so the
 * screenshot suite can skip as a whole unless `SCREENSHOT_CAPTURE` is set
 * (#594) while the guards still run in every e2e run. The 375px PNGs of the
 * round-start and story sheets are captured by
 * `_screenshots/round-start-mobile.spec.ts` and
 * `_screenshots/agenda-item-form-mobile.spec.ts`.
 *
 * Run:
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium tests/sheet-actions-mobile.spec.ts
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './fixtures/helpers';
import {
  agendaItemActionMobile,
  createSessionMobile,
  freshMobileCtx,
  onboardMobile,
  openAgendaItemSheetMobile,
  openRoundEditSheetMobile,
  openRoundStartSheetMobile,
  openSetPasswordSheetMobile,
} from './fixtures/open-sheet-375';

test('round-start sheet — Start visible and clickable in header', async ({ browser }) => {
  test.setTimeout(90_000);
  const { ctx, page } = await freshMobileCtx(browser);
  try {
    await onboardMobile(page, BASE_URL);
    await createSessionMobile(page);

    const sheet = await openRoundStartSheetMobile(page);

    const startBtn = sheet.getByRole('button', { name: 'Start round' });
    await expect(startBtn).toBeVisible({ timeout: 5_000 });
    // Interactable, not just rendered off-screen.
    await expect(startBtn).toBeEnabled();
    await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5_000 });
  } finally {
    await ctx.close();
  }
});

test('story form sheet (add) — Add visible in header', async ({ browser }) => {
  test.setTimeout(90_000);
  const { ctx, page } = await freshMobileCtx(browser);
  try {
    await onboardMobile(page, BASE_URL);
    await createSessionMobile(page);

    const sheet = await openAgendaItemSheetMobile(page);

    const addBtn = sheet.getByRole('button', { name: 'Add story' });
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    // Both title and ticket ID are empty, so Add is disabled but still shown.
    await expect(addBtn).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5_000 });

    // The rule is stated once, in plain words — not as an error that is on
    // screen before anything was typed.
    await expect(sheet).toContainText('A story needs a title or a ticket ID.');

    await sheet.getByRole('textbox', { name: 'Title' }).fill('Mobile story');
    await expect(addBtn).toBeEnabled({ timeout: 3_000 });
  } finally {
    await ctx.close();
  }
});

test('story form sheet (edit) — Save visible and clickable in header', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await freshMobileCtx(browser);
  try {
    await onboardMobile(page, BASE_URL, 'MobileHostEdit');
    await createSessionMobile(page);

    // Add a story first so there is one to edit.
    const sheet = await openAgendaItemSheetMobile(page);
    await sheet.getByRole('textbox', { name: 'Title' }).fill('Editable story');
    const addBtn = sheet.getByRole('button', { name: 'Add story' });
    await expect(addBtn).toBeEnabled({ timeout: 3_000 });
    await addBtn.click();
    await sheet.waitFor({ state: 'hidden', timeout: 15_000 });

    const firstItem = page.locator('app-agenda-panel ion-list.agenda-list ion-item.agenda-item');
    await firstItem.first().waitFor({ state: 'visible', timeout: 10_000 });
    await agendaItemActionMobile(page, 0, 'Edit');

    const editSheet = page.locator('app-agenda-item-form-sheet');
    await editSheet.waitFor({ state: 'visible', timeout: 10_000 });

    const saveBtn = editSheet.getByRole('button', { name: 'Save story' });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    // The pre-filled form is valid, so Save is enabled.
    await expect(saveBtn).toBeEnabled({ timeout: 3_000 });
    await expect(editSheet.getByRole('button', { name: 'Cancel' })).toBeVisible({
      timeout: 5_000,
    });
  } finally {
    await ctx.close();
  }
});

test('round-edit sheet — Save visible and clickable in header', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await freshMobileCtx(browser);
  try {
    await onboardMobile(page, BASE_URL);
    await createSessionMobile(page);

    const sheet = await openRoundEditSheetMobile(page);

    const saveBtn = sheet.getByRole('button', { name: 'Save round details' });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    // The title is pre-filled, so the disabled guard does not block the check.
    await expect(saveBtn).toBeEnabled();
  } finally {
    await ctx.close();
  }
});

test('session-password sheet — Done visible and clickable, only one Skip', async ({ browser }) => {
  test.setTimeout(90_000);
  const { ctx, page } = await freshMobileCtx(browser);
  try {
    await onboardMobile(page, BASE_URL);
    const sheet = await openSetPasswordSheetMobile(page, BASE_URL);

    const doneBtn = sheet.getByRole('button', { name: 'Done', exact: true });
    await expect(doneBtn).toBeVisible({ timeout: 5_000 });
    await expect(doneBtn).toBeEnabled();

    // Exactly one way out without a password, and no Cancel beside it. The
    // old layout had Cancel in the header AND in the footer. It reads "Skip":
    // the session exists either way, so the button skips the password.
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
