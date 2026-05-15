import { test, expect } from './fixtures/app.fixture';
import { APP_SETTINGS, BASE_URL, HOME, LOBBY, SETTINGS_SHEET } from './fixtures/helpers';
import type { Participant } from './fixtures/app.fixture';

/**
 * Regression: a custom scale's user-supplied `label` must be the text
 * rendered everywhere the scale is named — App Settings default-scale
 * row, Lobby subtitle, and Session Settings scale row. Previously these
 * surfaces routed the scale id through `formatScaleId(id)` which strips
 * the `custom-` prefix and title-cases the UUID, so a scale named
 * "Team Bananas" rendered as e.g. "7f3a" instead of its label.
 *
 * Negative case: when the label is blank, the rendered string falls back
 * to the formatted id (graceful degradation, not crashing).
 */

const CUSTOM_ID = 'custom-bananas';
const CUSTOM_LABEL = 'Team Bananas';

interface SeedScale {
  id: string;
  label: string;
  cards: string[];
}

/**
 * Seed `customScales` and the default `scale` preference into Capacitor
 * Preferences (web fallback = localStorage with `CapacitorStorage.` prefix)
 * before the app boots. Must run before navigation.
 */
async function seedCustomScale(p: Participant, scale: SeedScale): Promise<void> {
  await p.page.context().addInitScript(
    ({ seed, defaultId }: { seed: SeedScale; defaultId: string }) => {
      try {
        localStorage.setItem('CapacitorStorage.hnch.customScales', JSON.stringify([seed]));
        localStorage.setItem('CapacitorStorage.hnch.defaultScaleId', defaultId);
      } catch {
        // sandboxed iframe — ignore
      }
    },
    { seed: scale, defaultId: scale.id },
  );
}

test.describe('Custom scale name display', () => {
  test('label renders in App Settings, Lobby subtitle, and Session Settings', async ({ host }) => {
    await seedCustomScale(host, {
      id: CUSTOM_ID,
      label: CUSTOM_LABEL,
      cards: ['1', '2', '3'],
    });

    // Onboard if needed.
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/(home|onboarding)/);
    if (host.page.url().includes('/onboarding')) {
      await host.onboard();
    }

    // 1. App Settings default-scale row shows the custom label, not the id.
    await host.page.goto(`${BASE_URL}/settings`);
    await host.page.waitForURL(/\/settings/);
    const defaultScaleRow = host.page.locator(APP_SETTINGS.defaultScaleValue);
    await expect(defaultScaleRow).toContainText(CUSTOM_LABEL);
    await expect(defaultScaleRow).not.toContainText(CUSTOM_ID);

    // 2. Create a session — Lobby subtitle uses the default scale.
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);
    await host.page.locator(HOME.createCard).click();
    await host.page.waitForURL(/\/lobby/);

    const subtitle = host.page.locator(LOBBY.subtitle);
    await expect(subtitle).toContainText(CUSTOM_LABEL);
    await expect(subtitle).not.toContainText(CUSTOM_ID);

    // 3. Session Settings scale row shows the label too.
    await subtitle.click();
    await host.page.locator('app-session-settings-sheet').waitFor({ state: 'visible' });
    const scaleNote = host.page.locator(SETTINGS_SHEET.scaleValue);
    await expect(scaleNote).toContainText(CUSTOM_LABEL);
    await expect(scaleNote).not.toContainText(CUSTOM_ID);
  });

  test('falls back to formatted id when the custom label is blank', async ({ host }) => {
    // A custom scale missing a label should not crash the UI; it should
    // render the id-derived form (formatScaleId behaviour: strip
    // `custom-` prefix and title-case).
    const blankId = 'custom-no-label';
    await seedCustomScale(host, { id: blankId, label: '', cards: ['1', '2'] });

    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/(home|onboarding)/);
    if (host.page.url().includes('/onboarding')) {
      await host.onboard();
    }

    await host.page.goto(`${BASE_URL}/settings`);
    await host.page.waitForURL(/\/settings/);

    // Expected fallback for `custom-no-label` is `No Label`.
    const defaultScaleRow = host.page.locator(APP_SETTINGS.defaultScaleValue);
    await expect(defaultScaleRow).toContainText('No Label');
  });
});
