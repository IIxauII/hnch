/**
 * desktop-rail.spec.ts
 *
 * Asserts that the persistent desktop rail (hnch-rail inside ion-split-pane)
 * behaves correctly at different viewport sizes and routes.
 *
 * Shell mode logic (ShellModeService):
 *   - 'hidden'  → URL starts with /onboarding  → ion-menu disabled, display:none
 *   - 'session' → docService.hasSession()       → hnch-rail-session visible
 *   - 'public'  → home, join, settings, etc.    → hnch-rail-public visible
 *
 * ion-split-pane[when="(min-width: 1024px)"] adds class 'split-pane-visible'
 * when the viewport is ≥ 1024px and the pane is active.
 */

import { test, expect } from './fixtures/app.fixture';
import { BASE_URL } from './fixtures/helpers';

const SHELL = {
  splitPane: 'ion-split-pane[data-testid="app-shell"]',
  rail: '[data-testid="app-rail"]',
  menu: 'ion-split-pane[data-testid="app-shell"] ion-menu',
} as const;

test.describe('Desktop rail visibility', () => {
  // ---------------------------------------------------------------------------
  // 1440 x 900 — split pane active
  // ---------------------------------------------------------------------------
  test.describe('1440x900 viewport', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('rail visible on /home (public mode)', async ({ host }) => {
      await host.createSession(); // side-effect: onboards + navigates; we go home after
      await host.page.goto(`${BASE_URL}/home`);
      await host.page.waitForURL(/\/home/u);

      // Split pane activates at >=1024px — Ionic adds split-pane-visible class
      await expect(host.page.locator(SHELL.splitPane)).toHaveClass(/split-pane-visible/u, {
        timeout: 3_000,
      });

      // Rail element is in DOM and visible
      await expect(host.page.locator(SHELL.rail)).toBeVisible();
    });

    test('rail visible on /settings (public mode)', async ({ host }) => {
      await host.createSession();
      await host.page.goto(`${BASE_URL}/settings`);
      await host.page.waitForURL(/\/settings/u);

      await expect(host.page.locator(SHELL.splitPane)).toHaveClass(/split-pane-visible/u, {
        timeout: 3_000,
      });
      await expect(host.page.locator(SHELL.rail)).toBeVisible();
    });

    test('rail hidden on /onboarding (hidden mode)', async ({ browser }) => {
      // Fresh context with no display name → app redirects to /onboarding
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE_URL}/home`);
        await page.waitForURL(/\/(onboarding|home)/u, { timeout: 10_000 });
        if (!page.url().includes('/onboarding')) {
          // Already onboarded context — clear name and reload
          await page.evaluate(() => {
            localStorage.removeItem('CapacitorStorage.hnch.displayName');
          });
          await page.reload();
          await page.waitForURL(/\/onboarding/u, { timeout: 10_000 });
        }

        // shell-rail-hidden class added by AppShellComponent on 'hidden' mode
        const splitPane = page.locator(SHELL.splitPane);
        await expect(splitPane).toHaveClass(/shell-rail-hidden/u, { timeout: 3_000 });

        // ion-menu has display:none via .shell-rail-hidden ion-menu CSS rule
        const menu = page.locator(SHELL.menu);
        await menu.waitFor({ state: 'attached' });
        const display = await menu.evaluate((el) => getComputedStyle(el).display);
        expect(display).toBe('none');
      } finally {
        await ctx.close();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 390 x 844 — split pane inactive (mobile)
  // ---------------------------------------------------------------------------
  test.describe('390x844 viewport', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('split pane not active at mobile viewport', async ({ host }) => {
      await host.createSession();
      await host.page.goto(`${BASE_URL}/home`);
      await host.page.waitForURL(/\/home/u);

      // At 390px the split pane's media query does not trigger
      // → split-pane-visible class absent
      const splitPane = host.page.locator(SHELL.splitPane);
      await expect(splitPane).not.toHaveClass(/split-pane-visible/u, { timeout: 3_000 });
    });
  });
});
