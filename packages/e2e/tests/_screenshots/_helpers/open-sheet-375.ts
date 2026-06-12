/**
 * Shared helper: open a half-sheet on a 375px-wide mobile context and
 * return the page for visibility assertions.
 *
 * Used by the round-start, agenda-item-form, round-edit, and set-password
 * sheet e2e specs (issues #445–#448). Import this rather than copy-pasting
 * the freshCtx + onboard + sheet-open dance into every spec.
 *
 * Not a Playwright test file (no .spec.ts suffix) — the default testMatch
 * glob does not pick it up.
 */
import type { Browser, BrowserContext, Page } from '@playwright/test';

export const MOBILE_VIEWPORT = { width: 375, height: 812 } as const;

/**
 * Create a fresh 375px-wide browser context with a dark colour scheme.
 * The caller is responsible for closing `ctx` in a finally block.
 */
export async function freshMobileCtx(
  browser: Browser,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: MOBILE_VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

/**
 * Navigate to /home (or /onboarding) and complete onboarding if needed.
 * Leaves the page on the Home screen.
 */
export async function onboardMobile(
  page: Page,
  baseUrl: string,
  name = 'MobileHost',
): Promise<void> {
  await page.goto(`${baseUrl}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.locator('ion-input[autocapitalize="words"]').locator('input').fill(name);
    await page.locator('ion-button:has-text("Continue")').click();
    await page.waitForURL(/\/home/);
  }
}

/**
 * Create a session and navigate to the Lobby. Returns the 6-char room code.
 * Waits until the host "Start Round N" button is visible so callers know
 * host authority has been established.
 */
export async function createSessionMobile(page: Page): Promise<string> {
  await page.locator('ion-item:has(h2:text-is("Create Room"))').click();
  await page.waitForURL(/\/lobby/);
  await page.locator('ion-list.participants').waitFor({ state: 'visible' });
  await page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: /Start Round \d+/ })
    .waitFor({ state: 'visible', timeout: 12_000 });
  const code = (await page.locator('button.room-code span').textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

/**
 * Open the round-start half-sheet on a mobile page already on the Lobby
 * screen. Returns a locator scoped to the sheet element once it is visible.
 *
 * On mobile the sheet opens at the `0.6` breakpoint (buttons in a footer
 * would be off-screen here). After this call the sheet is visible at its
 * natural 0.6 breakpoint — DO NOT expand it to 0.95, because the whole
 * point of these tests is to assert button visibility at the initial
 * breakpoint.
 */
export async function openRoundStartSheetMobile(page: Page) {
  const startRoundBtn = page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: /Start Round \d+/ });
  await startRoundBtn.waitFor({ state: 'visible' });
  await startRoundBtn.click();
  const sheet = page.locator('app-round-start-sheet');
  await sheet.waitFor({ state: 'visible', timeout: 10_000 });
  return sheet;
}

/**
 * Enable "Password by default" in app settings, then return to Home and
 * create a room so the set-password half-sheet opens. Returns a locator
 * scoped to the sheet element once it is visible.
 *
 * Precondition: `page` is on the Home screen (after `onboardMobile`).
 * The caller is responsible for closing the browser context in a finally block.
 * DO NOT expand the sheet to 0.95 — assert button visibility at the natural
 * 0.6 breakpoint.
 */
export async function openSetPasswordSheetMobile(page: Page, baseUrl: string) {
  // Enable the "Password by default" toggle in app settings.
  await page.goto(`${baseUrl}/settings`);
  await page.waitForURL(/\/settings/);
  const toggle = page.locator('ion-toggle[aria-label="Enable password by default"]');
  await toggle.waitFor({ state: 'visible' });
  const isChecked = await toggle.evaluate(
    (el: HTMLElement & { checked?: boolean }) => el.checked === true,
  );
  if (!isChecked) {
    await toggle.click();
    await page.waitForTimeout(300);
  }

  // Return to Home.
  await page.goto(`${baseUrl}/home`);
  await page.waitForURL(/\/home/);

  // Create Room — the password-prompt sheet opens automatically.
  await page.locator('ion-item:has(h2:text-is("Create Room"))').click();
  const sheet = page.locator('app-password-prompt-sheet');
  await sheet.waitFor({ state: 'visible', timeout: 15_000 });
  return sheet;
}

/**
 * Open the agenda item form sheet (Add mode) on a mobile page already on the
 * Lobby screen. Returns a locator scoped to the sheet element once visible.
 *
 * On mobile the agenda panel is collapsed by default (AgendaPanelComponent
 * renders the expanded `.agenda-panel` only when `expanded()` is true). In a
 * fresh session with no items, the host sees a collapsed "Add agenda" chip
 * (`aria-label="No agenda items. Tap to add."`) that emits `addRequested`
 * directly — there is no `.agenda-panel` / "Add agenda item" button to wait
 * for. This helper opens the sheet via whichever affordance is present:
 *   - empty session: the "Add agenda" chip → opens the sheet directly;
 *   - non-empty session: the "Next up" chip → expand → "Add agenda item" btn.
 *
 * The sheet opens at the `0.6` initial breakpoint — do NOT expand it, because
 * the regression guard is specifically about visibility at that breakpoint.
 */
export async function openAgendaItemSheetMobile(page: Page) {
  const sheet = page.locator('app-agenda-item-form-sheet');

  // Empty-session host: a single collapsed "Add agenda" chip opens the sheet.
  const addChip = page.getByRole('button', { name: 'No agenda items. Tap to add.' });
  // Non-empty session: a "Next up" chip expands the panel.
  const nextUpChip = page.locator('app-agenda-panel ion-chip.next-up-chip');
  const panel = page.locator('app-agenda-panel .agenda-panel');

  await Promise.race([
    addChip.waitFor({ state: 'visible', timeout: 10_000 }),
    nextUpChip.waitFor({ state: 'visible', timeout: 10_000 }),
    panel.waitFor({ state: 'visible', timeout: 10_000 }),
  ]);

  if (await addChip.isVisible()) {
    await addChip.click();
    await sheet.waitFor({ state: 'visible', timeout: 10_000 });
    return sheet;
  }

  // Non-empty / already-expanded path: ensure the panel is expanded, then
  // use the host "Add agenda item" button inside it.
  if (!(await panel.isVisible()) && (await nextUpChip.isVisible())) {
    await nextUpChip.click();
  }
  await panel.waitFor({ state: 'visible', timeout: 10_000 });
  const addBtn = panel.getByRole('button', { name: 'Add agenda item' });
  await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await addBtn.click();
  await sheet.waitFor({ state: 'visible', timeout: 10_000 });
  return sheet;
}
