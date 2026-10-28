/* eslint-disable max-lines-per-function -- linear capture tour; splitting obscures capture order */
/**
 * Screenshot capture for agenda feature states (ADR-0042).
 *
 * Writes PNGs to docs/screenshots/<sha>/agenda/ (via shared helper) covering key agenda UI
 * states on desktop 1440 viewport: empty panel, add sheet (open + filled),
 * 3-item list, edit sheet, round-start pre-fill, mid-session (1 consumed),
 * skipped badge, cancelled hidden, and the list as a joiner sees it on a phone.
 *
 * Run with:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/agenda-states.spec.ts
 */
import path from 'node:path';
import { test, type BrowserContext, type Page } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import {
  BASE_URL,
  LOBBY,
  HOME,
  expandRoundStartSheet,
  clickRoundStartSubmit,
} from '../fixtures/helpers';
import { pageSettled } from './_helpers/settled';

const OUT_DIR = resolveOutDir('agenda');
// Disable trace/video/screenshot artefacts — we write our own files.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Serial mode: tests share a browser instance; use --workers=1 so contexts
// don't race for relay room slots when HNCH_ROOM_CAP limits concurrent peers.
test.describe.configure({ mode: 'serial' });

// Opt-in: only runs when SCREENSHOT_CAPTURE=1 so normal test runs skip it.
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function freshCtx(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function shot(page: Page, name: string): Promise<void> {
  await pageSettled(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function onboard(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.locator('ion-input[autocapitalize="words"]').locator('input').fill('ScreenHost');
    await page.locator('ion-button:has-text("Continue")').click();
    await page.waitForURL(/\/home/);
  }
}

async function createSession(page: Page): Promise<string> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
  // Wait for host status via startRoundBtn proxy.
  await page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: LOBBY.startRoundBtn })
    .waitFor({ state: 'visible', timeout: 12_000 });
  const code = (await page.locator('button.room-code span').textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

const ADD_BTN = 'app-lobby:not(.ion-page-hidden) app-agenda-panel ion-button.add-btn';
const AGENDA_ITEMS = 'app-lobby:not(.ion-page-hidden) app-agenda-panel ion-item.agenda-item';
const FORM = 'app-agenda-item-form-sheet';

async function addItem(page: Page, input: { title?: string; ticketId?: string }): Promise<void> {
  const addBtn = page.locator(ADD_BTN);
  await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await addBtn.click();

  const sheetTitle = page.locator(`${FORM} ion-title`);
  await sheetTitle.waitFor({ state: 'visible', timeout: 10_000 });

  if (input.title !== undefined) {
    await page
      .locator(`${FORM} ion-input[formcontrolname="title"] input`)
      .first()
      .fill(input.title);
  }
  if (input.ticketId !== undefined) {
    await page
      .locator(`${FORM} ion-input[formcontrolname="ticketId"] input`)
      .first()
      .fill(input.ticketId);
  }

  const submitBtn = page.locator(FORM).getByRole('button', { name: /^(Add|Save) story$/u });
  await submitBtn.waitFor({ state: 'visible', timeout: 5_000 });
  // Brief settle before submit to let Angular reactivity stabilize between rapid calls.
  await page.waitForTimeout(200);
  await submitBtn.click();
  await sheetTitle.waitFor({ state: 'hidden', timeout: 15_000 });
}

/** Open the ⋯ menu of the nth story (0-based). Popover on desktop, action sheet on touch. */
async function openItemMenu(page: Page, index: number): Promise<void> {
  await page.locator(AGENDA_ITEMS).nth(index).locator('ion-button.item-menu-btn').click();
  await page
    .locator('ion-popover, ion-action-sheet')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

/** Pick an action from the open story menu and wait for the menu to go. */
async function pickMenuAction(page: Page, action: string): Promise<void> {
  const inSheet = page.locator(`ion-action-sheet button:has-text("${action}")`);
  if (await inSheet.isVisible().catch(() => false)) {
    await inSheet.click();
  } else {
    await page.locator('ion-popover').getByRole('button', { name: action, exact: true }).click();
  }
  await page
    .locator('ion-popover, ion-action-sheet')
    .first()
    .waitFor({ state: 'hidden', timeout: 5_000 });
}

test.describe('agenda state screenshots', () => {
  test('desktop — all agenda states @host @layout', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await freshCtx(browser, { width: 1440, height: 900 });

    try {
      await onboard(page);
      await createSession(page);

      // 01 — empty agenda panel (host, desktop)
      await shot(page, '01-empty-agenda-host-desktop');

      // 02 — add sheet open (empty)
      const addBtn = page.locator(ADD_BTN);
      await addBtn.waitFor({ state: 'visible' });
      await addBtn.click();
      const sheetTitle = page.locator(`${FORM} ion-title`);
      await sheetTitle.waitFor({ state: 'visible', timeout: 10_000 });
      await shot(page, '02-agenda-add-sheet-open');

      // Fill and capture again
      await page
        .locator(`${FORM} ion-input[formcontrolname="title"] input`)
        .first()
        .fill('Login redesign');
      await page
        .locator(`${FORM} ion-input[formcontrolname="ticketId"] input`)
        .first()
        .fill('AUTH-101');
      await shot(page, '03-agenda-add-sheet-filled');

      // Submit
      const submitBtn = page.locator(FORM).getByRole('button', { name: 'Add story' });
      await submitBtn.click();
      await sheetTitle.waitFor({ state: 'hidden', timeout: 5_000 });

      // Add 2 more items
      await addItem(page, { title: 'API rate limiting', ticketId: 'PROJ-99' });
      await addItem(page, { ticketId: 'PROJ-42' });

      // 04 — 3-item list (host desktop)
      await shot(page, '04-agenda-3-items-host-desktop');

      // 04b — the story menu: every action on a story behind one ⋯ button
      await openItemMenu(page, 1);
      await page.waitForTimeout(300);
      await shot(page, '04b-agenda-story-menu');
      await page.keyboard.press('Escape');
      await page.locator('ion-popover').first().waitFor({ state: 'hidden', timeout: 5_000 });

      // 05 — edit sheet open for first item
      await openItemMenu(page, 0);
      await pickMenuAction(page, 'Edit');
      const editSheetTitle = page.locator(`${FORM} ion-title`);
      await editSheetTitle.waitFor({ state: 'visible', timeout: 10_000 });
      await shot(page, '05-agenda-edit-sheet-open');
      await page.keyboard.press('Escape');
      await editSheetTitle.waitFor({ state: 'hidden', timeout: 5_000 });

      // 06 — round-start modal pre-filled from item 1
      const startRoundBtn = page
        .locator('app-lobby:not(.ion-page-hidden) ion-button')
        .filter({ hasText: LOBBY.startRoundBtn });
      await startRoundBtn.waitFor({ state: 'visible' });
      await startRoundBtn.click();
      await expandRoundStartSheet(page);
      await shot(page, '06-round-start-modal-prefilled');

      // Start round, vote, and return to lobby
      await clickRoundStartSubmit(page);
      await page.locator('app-estimating:not(.ion-page-hidden)').waitFor({ state: 'visible' });
      await page
        .locator('app-estimating ion-card.card:has(ion-card-content:text-is("5"))')
        .first()
        .click();
      await page.waitForURL(/\/lobby/, { timeout: 15_000 });
      await page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 8_000 });

      // 07 — mid-session: item 1 consumed
      await shot(page, '07-agenda-mid-session-one-consumed');

      // Skip item 3 (index 2)
      await openItemMenu(page, 2);
      await pickMenuAction(page, 'Skip');
      await page.waitForTimeout(300);

      // 08 — skipped story
      await shot(page, '08-agenda-skipped-badge');

      // Remove item 2 (index 1)
      await openItemMenu(page, 1);
      await pickMenuAction(page, 'Remove');
      await page.waitForTimeout(300);

      // 09 — removed story hidden ("Show removed" appears)
      await shot(page, '09-agenda-cancelled-hidden');
    } finally {
      await ctx.close();
    }
  });

  test('mobile — what a joiner sees @host @layout @participants', async ({ browser }) => {
    test.setTimeout(90_000);

    // Host session with items
    const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, { width: 1440, height: 900 });
    // Joiner on mobile viewport
    const { ctx: joinerCtx, page: joinerPage } = await freshCtx(browser, {
      width: 375,
      height: 812,
    });

    try {
      await onboard(hostPage);
      const code = await createSession(hostPage);
      await addItem(hostPage, { title: 'Story Alpha' });
      await addItem(hostPage, { title: 'Story Beta', ticketId: 'BETA-1' });

      // Joiner joins
      await joinerPage.goto(`${BASE_URL}/home`);
      await joinerPage.waitForURL(/\/(home|onboarding)/);
      if (joinerPage.url().includes('/onboarding')) {
        await joinerPage
          .locator('ion-input[autocapitalize="words"]')
          .locator('input')
          .fill('Joiner');
        await joinerPage.locator('ion-button:has-text("Continue")').click();
        await joinerPage.waitForURL(/\/home/);
      }
      await joinerPage.locator(HOME.joinCard).click();
      await joinerPage.waitForURL(/\/join/);
      const firstTile = joinerPage.locator('app-segmented-code-input').locator('input').first();
      await firstTile.focus();
      await joinerPage.keyboard.type(code);
      // The sixth character submits: no Join tap after a typed code.
      await joinerPage.waitForURL(/\/lobby/, { timeout: 15_000 });

      // 10 — joiner on a phone: the whole list, no controls, "Next" on the first story
      const items = joinerPage.locator(AGENDA_ITEMS);
      await items.first().waitFor({ state: 'visible', timeout: 10_000 });
      await joinerPage
        .locator('app-agenda-panel ion-badge.next-badge')
        .waitFor({ state: 'visible' });
      await joinerPage
        .locator('app-lobby:not(.ion-page-hidden) .agenda-card')
        .scrollIntoViewIfNeeded();
      await shot(joinerPage, '10-agenda-joiner-mobile');
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});
