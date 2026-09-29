import { devices } from '@playwright/test';
import { test, expect, Participant } from './fixtures/app.fixture';
import { BASE_URL, ESTIMATING, HOME, LOBBY, ROUND_FIELD } from './fixtures/helpers';

/**
 * Where the cursor is when a form opens.
 *
 * A sheet that exists to be typed into opens with the cursor in its first
 * field: the next thing the user does is type, not tap the field. The one
 * exception is the round form on a phone — every field in it is optional,
 * most rounds start with it as it is, and a keyboard would cover it.
 */

const LOBBY_PAGE = 'app-lobby:not(.ion-page-hidden)';

test.describe('Forms open ready to type', () => {
  test('Add story: type the title, Enter adds it', async ({ host }) => {
    await host.createSession();

    await host.page.locator(`${LOBBY_PAGE} app-agenda-panel ion-button.add-btn`).click();
    const title = host.page.getByRole('textbox', { name: 'Title', exact: true });
    await expect(title).toBeFocused();

    await host.page.keyboard.type('Login form');
    await host.page.keyboard.press('Enter');

    await expect(host.page.locator('app-agenda-item-form-sheet')).toHaveCount(0);
    await host.expectAgendaItems([{ title: 'Login form' }]);
  });

  test('Start round: type what is being estimated, Enter starts it', async ({ host }) => {
    await host.createSession();

    await host.page
      .locator(`${LOBBY_PAGE} ion-button`)
      .filter({ hasText: LOBBY.startRoundBtn })
      .click();
    const title = host.page.getByRole('textbox', { name: ROUND_FIELD.title });
    await expect(title).toBeFocused();

    await host.page.keyboard.type('Checkout flow');
    await host.page.keyboard.press('Enter');

    await host.waitForEstimating();
    await expect(host.page.locator(ESTIMATING.descriptor)).toHaveText('Checkout flow');
  });

  test('Session password: type it, Enter creates the session', async ({ host }) => {
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/(home|onboarding)/);
    if (host.page.url().includes('/onboarding')) await host.onboard();

    // "Ask for a password" is a device setting
    await host.page.evaluate(() => {
      localStorage.setItem('CapacitorStorage.hnch.defaultPassword', 'true');
    });
    await host.page.reload();
    await host.page.locator(HOME.createCard).click();

    const sheet = host.page.locator('app-password-prompt-sheet');
    await expect(sheet).toBeVisible();
    const password = sheet.locator('ion-input[label="Password"] input');
    await expect(password).toBeFocused();

    await host.page.keyboard.type('hunter2');
    await host.page.keyboard.press('Enter');

    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('Password protected');
  });

  test('Relay URL: the field has the cursor', async ({ host }) => {
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/(home|onboarding)/);
    if (host.page.url().includes('/onboarding')) await host.onboard();
    await host.navigateToAppSettings();

    await host.page.locator('app-settings ion-item', { hasText: 'Relay URL' }).click();

    const sheet = host.page.locator('app-relay-url-editor-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Relay URL' })).toBeFocused();
  });
});

test.describe('Forms on a phone', () => {
  // Strip defaultBrowserType — see lobby-host-actions-mobile.spec.ts.
  const { defaultBrowserType: _defaultBrowserType, ...IPHONE_13 } = devices['iPhone 13'];

  test('the round form opens without a keyboard; Add story with the cursor in the title', async ({
    browser,
  }) => {
    const ctx = await browser.newContext(IPHONE_13);
    const host = new Participant(ctx, await ctx.newPage(), 'Host');
    /** The tag of whatever has the focus, looking through shadow roots. */
    const focused = () =>
      host.page.evaluate(() => {
        let el = document.activeElement;
        while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
        return el?.tagName.toLowerCase() ?? null;
      });

    try {
      await host.createSession();

      await host.page
        .locator(`${LOBBY_PAGE} ion-button`)
        .filter({ hasText: LOBBY.startRoundBtn })
        .click();
      const sheet = host.page.locator('app-round-start-sheet');
      await expect(sheet).toBeVisible();
      // Past the point where a field would have been focused
      await host.page.waitForTimeout(1_000);
      expect(await focused()).not.toBe('input');
      expect(await focused()).not.toBe('textarea');
      await sheet.locator('ion-button', { hasText: 'Cancel' }).click();
      await expect(sheet).toHaveCount(0);

      await host.page.locator(`${LOBBY_PAGE} app-agenda-panel ion-button.add-btn`).click();
      await expect(host.page.locator('app-agenda-item-form-sheet')).toBeVisible();
      await expect
        .poll(() =>
          host.page.evaluate(() => {
            const el = document.activeElement;
            return el instanceof HTMLInputElement
              ? (el.closest('ion-input')?.getAttribute('label') ?? null)
              : null;
          }),
        )
        .toBe('Title');
    } finally {
      await ctx.close();
    }
  });
});
