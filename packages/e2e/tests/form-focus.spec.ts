import { devices } from '@playwright/test';
import { test, expect, Participant } from './fixtures/app.fixture';
import { APP_SETTINGS, BASE_URL, ESTIMATING, HOME, LOBBY, ROUND_FIELD } from './fixtures/helpers';

/**
 * Where the cursor is when a form opens.
 *
 * A sheet that exists to be typed into opens with the cursor in its first
 * field: the next thing the user does is type, not tap the field. The
 * exception is a form that mostly goes out as it is — the round form, where
 * every field is optional, and the form that edits a round. On a phone a
 * keyboard would cover them, so they take the cursor on the desktop surface
 * only.
 */

const LOBBY_PAGE = 'app-lobby:not(.ion-page-hidden)';

test.describe('Forms open ready to type', () => {
  test('Add story: type the title, Enter adds it', async ({ host }) => {
    await host.createSession();

    await host.page.locator(`${LOBBY_PAGE} app-agenda-panel ion-button.add-btn`).click();
    const title = host.page.getByRole('textbox', { name: 'Title', exact: true });
    await expect(title).toBeFocused();
    // The key says what it does: labelled "next" it still submitted, and on
    // iOS that key sends Enter.
    await expect(title).toHaveAttribute('enterkeyhint', 'done');

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

  test('Edit round: the title has the cursor, Enter saves', async ({ host }) => {
    await host.createSession();
    await host.startRound('Checkout');
    await host.castVote('5');
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    await host.page.locator('.results-descriptor-row ion-button.edit-btn').click();
    const sheet = host.page.locator('app-round-edit-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: ROUND_FIELD.title })).toBeFocused();

    // At the end of what is there
    await host.page.keyboard.type(' flow');
    await host.page.keyboard.press('Enter');

    await expect(sheet).toHaveCount(0);
    await expect(host.page.locator(`${LOBBY.resultsSection} p.results-descriptor`)).toHaveText(
      'Checkout flow',
    );
  });

  test('New custom scale: from the name to a saved scale without the mouse', async ({ host }) => {
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/(home|onboarding)/);
    if (host.page.url().includes('/onboarding')) await host.onboard();
    await host.navigateToAppSettings();
    await host.page.locator(APP_SETTINGS.defaultScaleRow).click();
    await host.page
      .locator('app-scale-picker-sheet ion-item', { hasText: 'Create custom scale' })
      .click();

    const editor = host.page.locator('app-custom-scale-editor-sheet');
    await expect(editor).toBeVisible();
    const close = editor.locator('ion-toolbar ion-button');
    await expect(editor.getByRole('textbox', { name: 'Scale name' })).toBeFocused();
    // Nothing to keep yet
    await expect(close).toHaveText('Cancel');

    await host.page.keyboard.type('Team sizes');
    await host.page.keyboard.press('Tab');
    await expect(editor.getByRole('textbox', { name: 'New card' })).toBeFocused();
    for (const card of ['S', 'M', 'L']) {
      await host.page.keyboard.type(card);
      await host.page.keyboard.press('Enter');
    }

    // Saved as it is typed: the one button says so, where it has been all along
    await expect(editor.locator('.card-face')).toHaveText(['S', 'M', 'L']);
    await expect(close).toHaveText('Done');
    await expect(editor.locator('ion-toolbar ion-buttons')).toHaveCount(1);

    // The last card is removed from the keyboard, and the focus stays with
    // the cards instead of dropping back to the top of the page.
    await editor.getByRole('button', { name: 'Remove card L' }).focus();
    await host.page.keyboard.press('Enter');
    await expect(editor.locator('.card-face')).toHaveText(['S', 'M']);
    await expect(editor.getByRole('button', { name: 'Remove card M' })).toBeFocused();

    await close.click();
    await expect(editor).toHaveCount(0);
    await expect(
      host.page.locator('app-scale-picker-sheet ion-item', { hasText: 'Team sizes' }),
    ).toBeVisible();
  });

  // Done reads as "saved". With one card left the scale is not, and the
  // sheet says that it is not.
  test('Custom scale: an edit that cannot be saved says so', async ({ host }) => {
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/(home|onboarding)/);
    if (host.page.url().includes('/onboarding')) await host.onboard();
    await host.page.evaluate(() => {
      localStorage.setItem(
        'CapacitorStorage.hnch.customScales',
        JSON.stringify([{ id: 'custom-e2e-pair', label: 'Pair', cards: ['S', 'M'] }]),
      );
    });
    await host.navigateToAppSettings();
    await host.page.reload();
    await host.page.locator(APP_SETTINGS.defaultScaleRow).click();
    await host.page
      .locator('app-scale-picker-sheet ion-item:has(h3:text-is("Pair")) ion-button')
      .click();

    const editor = host.page.locator('app-custom-scale-editor-sheet');
    await expect(editor).toBeVisible();
    await expect(editor.locator('.empty-hint')).toHaveCount(0);

    await editor.getByRole('button', { name: 'Remove card M' }).click();

    await expect(editor.locator('.empty-hint')).toHaveText(
      'Not saved: a scale needs a name and at least 2 cards.',
    );
    await editor.locator('ion-toolbar ion-button').click();
    await expect(editor).toHaveCount(0);

    // As it was last saved
    const saved = await host.page.evaluate(
      () => localStorage.getItem('CapacitorStorage.hnch.customScales') ?? '',
    );
    expect(JSON.parse(saved)).toEqual([
      { id: 'custom-e2e-pair', label: 'Pair', cards: ['S', 'M'] },
    ]);
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
      await host.page.waitForTimeout(1_200);
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
