import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Wait until the page transition is over: exactly one page showing, and it is
 * fully in. Without this a shot catches the page being left, still fading
 * behind the new one.
 *
 * Call it once the new page's content is known to be there — before that, the
 * one page showing is still the old one.
 */
export async function pageSettled(page: Page): Promise<void> {
  await expect(page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')).toHaveCount(1, {
    timeout: 5_000,
  });
  await expect(page.locator('ion-router-outlet > .ion-page.ion-page-invisible')).toHaveCount(0);
}
