import { test, expect } from './fixtures/app.fixture';
import {
  APP_SETTINGS,
  SELECT_POPOVER,
  APP_SETTINGS_SCALE_PICKER,
  HOME,
  LOBBY,
  SETTINGS_SHEET,
  ESTIMATING,
  BASE_URL,
} from './fixtures/helpers';
import type { Participant } from './fixtures/app.fixture';

/**
 * App Settings page — theme picker, display name editor, default scale,
 * and version display.
 *
 * These tests use a single participant (no relay needed for local
 * preference changes). Navigate directly to /settings after onboarding.
 */
test.describe('App Settings', () => {
  /** Onboard then navigate to /settings. */
  async function setupAndGoToSettings(p: Participant): Promise<void> {
    await p.page.goto(`${BASE_URL}/home`);
    await p.page.waitForURL(/\/(home|onboarding)/);
    if (p.page.url().includes('/onboarding')) {
      await p.onboard();
    }
    await p.page.goto(`${BASE_URL}/settings`);
    await p.page.waitForURL(/\/settings/);
  }

  /** Read the current value of an ion-select element. */
  async function selectValue(p: Participant, locator: string): Promise<unknown> {
    return p.page.locator(locator).evaluate((el) => (el as HTMLElement & { value: unknown }).value);
  }

  /** Open an ion-select popover and choose the option with the given label. */
  async function chooseSelectOption(
    p: Participant,
    selectLocator: string,
    optionLabel: string,
  ): Promise<void> {
    await p.page.locator(selectLocator).click();
    const option = p.page.locator(SELECT_POPOVER.option(optionLabel));
    await option.waitFor({ state: 'visible' });
    await option.click();
    // Popover auto-dismisses on selection; wait for it to disappear so the
    // next interaction lands on the page, not the fading overlay.
    await p.page.locator('ion-select-popover').waitFor({ state: 'hidden' });
  }

  test('theme picker cycles through Dark → Light → System', async ({ host }) => {
    await setupAndGoToSettings(host);

    // Default theme should be "system"
    expect(await selectValue(host, APP_SETTINGS.themeSelect)).toBe('system');

    // Switch to Dark
    await chooseSelectOption(host, APP_SETTINGS.themeSelect, 'Dark');
    expect(
      await host.page.evaluate(() =>
        document.documentElement.classList.contains('ion-palette-dark'),
      ),
    ).toBe(true);
    expect(await selectValue(host, APP_SETTINGS.themeSelect)).toBe('dark');

    // Switch to Light
    await chooseSelectOption(host, APP_SETTINGS.themeSelect, 'Light');
    expect(
      await host.page.evaluate(() =>
        document.documentElement.classList.contains('ion-palette-dark'),
      ),
    ).toBe(false);
    expect(await selectValue(host, APP_SETTINGS.themeSelect)).toBe('light');

    // Switch back to System
    await chooseSelectOption(host, APP_SETTINGS.themeSelect, 'System');
    expect(await selectValue(host, APP_SETTINGS.themeSelect)).toBe('system');
  });

  test('display name change persists across settings re-entry', async ({ host }) => {
    await setupAndGoToSettings(host);

    // Current name should be "Host" (from fixture). The display name is an
    // inline ion-input with blur-save — read its value via JS.
    const readValue = (): Promise<unknown> =>
      host.page
        .locator(APP_SETTINGS.nameInput)
        .evaluate((el) => (el as HTMLElement & { value: unknown }).value);

    expect(await readValue()).toBe('Host');

    // Edit the name inline and blur to commit.
    const nativeInput = host.page.locator(APP_SETTINGS.nameInput).locator('input');
    await nativeInput.fill('NewHost');
    await nativeInput.blur();

    expect(await readValue()).toBe('NewHost');

    // Navigate back and re-enter settings — name should persist.
    await host.page.goto(`${BASE_URL}/settings`);
    await host.page.waitForURL(/\/settings/);

    expect(await readValue()).toBe('NewHost');
  });

  test('settings page shows version string', async ({ host }) => {
    await setupAndGoToSettings(host);

    await expect(host.page.locator(APP_SETTINGS.versionValue)).toHaveText(/^\d+\.\d+\.\d+$/);
  });

  // ---------------------------------------------------------------------------
  // Default Scale tests
  // ---------------------------------------------------------------------------

  test('set default scale in Settings → row updates to show new scale name', async ({ host }) => {
    await setupAndGoToSettings(host);

    // Default scale should initially be Fibonacci (default builtin)
    await expect(host.page.locator(APP_SETTINGS.defaultScaleValue)).toContainText('Fibonacci');

    // Open picker and select T-Shirt
    await host.setDefaultScale('T-Shirt');

    // Row should now show T-shirt
    await expect(host.page.locator(APP_SETTINGS.defaultScaleValue)).toContainText('T-shirt');
  });

  test('default scale persists across page reload', async ({ host }) => {
    await setupAndGoToSettings(host);

    // Set to Powers of 2
    await host.setDefaultScale('Powers of 2');
    await expect(host.page.locator(APP_SETTINGS.defaultScaleValue)).toContainText('Powers of 2');

    // Reload the page
    await host.page.reload();
    await host.page.waitForURL(/\/settings/);

    // Scale preference should persist
    await expect(host.page.locator(APP_SETTINGS.defaultScaleValue)).toContainText('Powers of 2');
  });

  test('new session uses default scale → lobby subtitle shows selected scale', async ({ host }) => {
    // Go to settings and set Linear as default
    await setupAndGoToSettings(host);
    await host.setDefaultScale('Linear');

    // Now create a new session
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);
    await host.page.locator(HOME.createCard).click();
    await host.page.waitForURL(/\/lobby/);

    // Open session settings and verify scale is Linear
    await host.page.locator(LOBBY.subtitle).click();
    await host.page.locator('app-session-settings-sheet').waitFor({ state: 'visible' });

    // The session settings sheet should show Linear as the current scale
    const scaleNote = host.page.locator(SETTINGS_SHEET.scaleValue);
    await expect(scaleNote).toContainText('Linear');
  });

  test('session scale picker pre-selects the default scale', async ({ host }) => {
    // Set Risk as the default scale
    await setupAndGoToSettings(host);
    await host.setDefaultScale('Risk');

    // Create a new session
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);
    await host.page.locator(HOME.createCard).click();
    await host.page.waitForURL(/\/lobby/);

    // Open session settings and then scale picker
    await host.page.locator(LOBBY.subtitle).click();
    await host.page.locator('app-session-settings-sheet').waitFor({ state: 'visible' });
    await host.page.locator(SETTINGS_SHEET.scaleRow).click();

    // The Risk radio should be pre-selected
    const riskRadio = host.page.locator(APP_SETTINGS_SCALE_PICKER.scaleRadio('Risk'));
    const isChecked = await riskRadio.evaluate((el: HTMLElement) => {
      return (el as any).checked;
    });
    expect(isChecked).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Preset Modification tests
  // ---------------------------------------------------------------------------

  test('modify preset (toggle card off on Fibonacci) → reflected in session', async ({ host }) => {
    await setupAndGoToSettings(host);

    // First create a session with default Fibonacci to see all cards
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);
    await host.page.locator(HOME.createCard).click();
    await host.page.waitForURL(/\/lobby/);

    // Verify the session uses Fibonacci scale
    let subtitleText = await host.page.locator(LOBBY.subtitle).textContent();
    expect(subtitleText).toContain('Fibonacci');

    // Go back to settings
    await host.page.goto(`${BASE_URL}/settings`);
    await host.page.waitForURL(/\/settings/);

    // Open default scale picker and toggle off the "0" card from Fibonacci
    await host.togglePresetCard('Fibonacci', '0');

    // Close the picker
    await host.page.waitForURL(/\/settings/);

    // Now create a new session
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);
    await host.page.locator(HOME.createCard).click();
    await host.page.waitForURL(/\/lobby/);

    // Navigate to estimating to see the cards (any round will do)
    await host.startRound('Test round');
    await host.page.waitForURL(/\/estimating/);

    // The grid should NOT contain card "0" anymore
    const cardZero = host.page.locator(ESTIMATING.card('0'));
    await expect(cardZero).not.toBeVisible();

    // But card "1" should still be there
    const cardOne = host.page.locator(ESTIMATING.card('1'));
    await expect(cardOne).toBeVisible();
  });
});
