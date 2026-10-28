import { devices } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { test, expect, Participant } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

/**
 * Touch targets.
 *
 * Several controls are drawn smaller than a fingertip — the back chevron is
 * 24px wide, a toolbar button 32px tall. On a device with a touch screen each
 * of them answers to a 44px area around its centre (`touch-target` mixin,
 * ionic.md).
 *
 * Measured by hit-testing, and acted on with a plain pointer click. A
 * synthesized *tap* would prove nothing: the browser snaps a touch to the
 * nearest control by itself, whether or not the control's area reaches that
 * far.
 */

// Strip defaultBrowserType — see lobby-host-actions-mobile.spec.ts.
const { defaultBrowserType: _defaultBrowserType, ...IPHONE_13 } = devices['iPhone 13'];

const TARGET = 44;

/**
 * Resolves once the page transition is over: one page left in the outlet, and
 * `control` at rest. Until then its box is still moving.
 */
async function atRest(page: Page, control: Locator): Promise<void> {
  await expect(page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')).toHaveCount(1);
  await control.click({ trial: true });
}

/**
 * Width and height of the area around `control`'s centre in which a pointer
 * lands on the control, walked outwards pixel by pixel. Stops at the edge of
 * the screen: nothing can be tapped beyond it.
 */
async function hitArea(control: Locator): Promise<{ width: number; height: number }> {
  return control.evaluate((el) => {
    const root = el.getRootNode();
    const host = root instanceof ShadowRoot ? root.host : el;
    const box = host.getBoundingClientRect();
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;

    const lands = (x: number, y: number): boolean => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === host || host.contains(hit));
    };
    const reach = (stepX: number, stepY: number): number => {
      let distance = 0;
      while (
        distance < 40 &&
        lands(centerX + stepX * (distance + 1), centerY + stepY * (distance + 1))
      ) {
        distance += 1;
      }
      return distance;
    };

    return {
      width: reach(-1, 0) + reach(1, 0) + 1,
      height: reach(0, -1) + reach(0, 1) + 1,
    };
  });
}

/** Click with a plain pointer 4px outside the drawn box of `control`. */
async function clickBeside(
  page: Page,
  control: Locator,
  side: 'above' | 'below' | 'right',
): Promise<void> {
  const box = await control.boundingBox();
  if (!box) throw new Error('control is not rendered');
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const point = {
    above: { x: centerX, y: box.y - 4 },
    below: { x: centerX, y: box.y + box.height + 4 },
    right: { x: box.x + box.width + 4, y: centerY },
  }[side];
  await page.mouse.click(point.x, point.y);
}

test.describe('Touch targets on a phone', () => {
  test('toolbar buttons answer to 44px, drawn smaller', async ({ browser }) => {
    const context = await browser.newContext(IPHONE_13);
    const page = await context.newPage();
    const user = new Participant(context, page, 'Host');

    try {
      await page.goto('/home');
      await user.onboard();

      // Home → Settings: the gear.
      const gear = page.getByRole('button', { name: 'Settings' });
      await atRest(page, gear);
      expect((await gear.boundingBox())?.height).toBeLessThan(TARGET);
      const gearArea = await hitArea(gear);
      expect(gearArea.width).toBeGreaterThanOrEqual(TARGET - 1);
      expect(gearArea.height).toBeGreaterThanOrEqual(TARGET - 1);

      await clickBeside(page, gear, 'below');
      await page.waitForURL(/\/settings/, { timeout: 5_000 });

      // Settings → Home: the back chevron. It sits against the edge of the
      // screen, so its area is as wide as the screen lets it be.
      const back = page.locator('app-settings:not(.ion-page-hidden) ion-back-button');
      await atRest(page, back);
      expect((await back.boundingBox())?.width).toBeLessThan(TARGET);
      const backArea = await hitArea(back);
      expect(backArea.height).toBeGreaterThanOrEqual(TARGET - 1);
      expect(backArea.width).toBeGreaterThan((await back.boundingBox())!.width + 8);

      await clickBeside(page, back, 'right');
      await page.waitForURL(/\/home/, { timeout: 5_000 });
    } finally {
      await context.close();
    }
  });

  test('controls in the Lobby answer to 44px, drawn smaller', async ({ browser }) => {
    const context = await browser.newContext(IPHONE_13);
    const page = await context.newPage();
    const host = new Participant(context, page, 'Host');

    try {
      await host.createSession();

      // The role chip.
      const role = page.locator('app-lobby:not(.ion-page-hidden) app-role-toggle ion-button');
      await atRest(page, role);
      await expect(role).toHaveText('Voter');
      expect((await role.boundingBox())?.height).toBeLessThan(TARGET);
      expect((await hitArea(role)).height).toBeGreaterThanOrEqual(TARGET - 1);

      await clickBeside(page, role, 'above');
      await expect(role).toHaveText('Observer');

      // The session settings link.
      const settings = page.locator(LOBBY.subtitleHostBtn);
      expect((await settings.boundingBox())?.height).toBeLessThan(TARGET);
      expect((await hitArea(settings)).height).toBeGreaterThanOrEqual(TARGET - 1);

      await clickBeside(page, settings, 'below');
      const sheet = page.locator('app-session-settings-sheet');
      await sheet.waitFor({ state: 'visible' });

      // "Done" in the sheet's toolbar.
      const done = sheet.getByRole('button', { name: 'Done' });
      await done.click({ trial: true });
      expect((await done.boundingBox())?.height).toBeLessThan(TARGET);
      expect((await hitArea(done)).height).toBeGreaterThanOrEqual(TARGET - 1);

      await clickBeside(page, done, 'below');
      await sheet.waitFor({ state: 'hidden' });
    } finally {
      await context.close();
    }
  });

  test('a pointer inside a control still lands on the control itself', async ({ browser }) => {
    // The hit area sits behind the control. Were it in front, every tap would
    // land on the host element instead of the button inside it.
    const context = await browser.newContext(IPHONE_13);
    const page = await context.newPage();
    const user = new Participant(context, page, 'Host');

    try {
      await page.goto('/home');
      await user.onboard();

      const gear = page.getByRole('button', { name: 'Settings' });
      await atRest(page, gear);
      const hit = await gear.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const root = button.getRootNode() as ShadowRoot;
        const at = root.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return at !== null && (at === button || button.contains(at));
      });
      expect(hit).toBe(true);
    } finally {
      await context.close();
    }
  });
});

test.describe('Touch targets with a mouse', () => {
  test('a control answers to what is drawn, and no more', async ({ host }) => {
    // No touch screen, no extra area: next to a small control a mouse is
    // pointing at whatever is actually there.
    await host.createSession();

    const role = host.page.locator('app-lobby:not(.ion-page-hidden) app-role-toggle ion-button');
    await atRest(host.page, role);
    const box = await role.boundingBox();
    const area = await hitArea(role);
    expect(Math.abs(area.height - box!.height)).toBeLessThanOrEqual(1);
  });
});
