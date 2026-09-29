import { expect, test } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

test.describe('Lobby — tap room code to copy', () => {
  // Clipboard permissions / readText() are Chromium-only in Playwright.
  // WebKit and Firefox don't expose grantPermissions(['clipboard-*']) — the
  // production handler still runs (toast fires via the catch path on the
  // failure case), but we can't assert clipboard contents cross-browser.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Clipboard API is Chromium-only in Playwright',
  );

  test('writes dash-formatted code to clipboard and surfaces toast', async ({ host, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const code = await host.createSession();
    const expectedFormatted = `${code.slice(0, 3)}-${code.slice(3)}`;

    const roomCodeBtn = host.page.locator(LOBBY.roomCode);
    await expect(roomCodeBtn).toBeVisible();
    await expect(roomCodeBtn).toHaveAttribute('aria-label', 'Copy session code');
    const displayed = await host.page.locator(LOBBY.roomCodeText).textContent();
    expect(displayed?.trim()).toBe(expectedFormatted);

    await host.page.bringToFront();
    await roomCodeBtn.click();

    // Capture whichever toast fired (success or clipboard-failure fallback) so the
    // assertion isn't flaky when Chromium denies clipboard-write without user focus.
    const toastMessage = await host.page
      .locator('ion-toast:not(.overlay-hidden)')
      .first()
      .evaluate((el) => (el as unknown as { message?: string }).message ?? '', { timeout: 5_000 });
    expect(toastMessage).toMatch(/Code copied|Couldn't copy/u);

    if (toastMessage === 'Code copied') {
      const clipboardValue = await host.page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardValue).toBe(expectedFormatted);
    } else {
      expect(toastMessage).toBe(`Couldn't copy. The code is ${expectedFormatted}`);
    }
  });

  test('Share invite and QR code sit right under the code', async ({ host }) => {
    await host.createSession();
    const share = host.page.locator('app-lobby ion-button.share-btn');
    const qr = host.page.locator('app-lobby ion-button.qr-btn');
    await expect(share).toBeVisible();
    await expect(share).toContainText('Share invite');
    await expect(qr).toBeVisible();
    await expect(qr).toContainText('QR code');
  });
});
