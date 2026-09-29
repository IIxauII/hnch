import { expect, test } from './fixtures/app.fixture';
import { LOBBY, expectToast } from './fixtures/helpers';

test.describe('Lobby — tap room code to copy', () => {
  // Clipboard permissions / readText() are Chromium-only in Playwright.
  // WebKit and Firefox don't expose grantPermissions(['clipboard-*']) — the
  // production handler still runs (toast fires via the catch path on the
  // failure case), but we can't assert clipboard contents cross-browser.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Clipboard API is Chromium-only in Playwright',
  );

  test('writes dash-formatted code to clipboard and surfaces toast', async ({ host }) => {
    // On the host's own context: the fixture gives every participant one,
    // and a grant on the default context never reaches this page.
    await host.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const code = await host.createSession();
    const expectedFormatted = `${code.slice(0, 3)}-${code.slice(3)}`;

    const roomCodeBtn = host.page.locator(LOBBY.roomCode);
    await expect(roomCodeBtn).toBeVisible();
    // The name says what gets copied, so the code is read out with it.
    await expect(roomCodeBtn).toHaveAttribute(
      'aria-label',
      `Copy session code ${expectedFormatted}`,
    );
    const displayed = await host.page.locator(LOBBY.roomCodeText).textContent();
    expect(displayed?.trim()).toBe(expectedFormatted);

    await host.page.bringToFront();
    await roomCodeBtn.click();

    await expectToast(host.page, 'Code copied');
    const clipboardValue = await host.page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardValue).toBe(expectedFormatted);
  });

  test('says the code when it cannot be copied', async ({ host }) => {
    const code = await host.createSession();
    const expectedFormatted = `${code.slice(0, 3)}-${code.slice(3)}`;
    // What a browser does that has no clipboard, or will not hand it over.
    await host.page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });

    await host.page.locator(LOBBY.roomCode).click();

    await expectToast(host.page, `Couldn't copy. The code is ${expectedFormatted}`);
  });

  test('Share invite and QR code sit right under the code', async ({ host }) => {
    await host.createSession();
    const share = host.page.locator('app-lobby ion-button.share-btn');
    const qr = host.page.locator('app-lobby ion-button.qr-btn');
    await expect(share).toBeVisible();
    await expect(share).toContainText('Share invite');
    await expect(qr).toBeVisible();
    await expect(qr).toContainText('QR code');

    // All four in one reading: the page may still be sliding in, and boxes
    // read one after the other would each be from a different frame.
    const box = await host.page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(`app-lobby:not(.ion-page-hidden) ${selector}`);
        if (el === null) throw new Error(`${selector} is not on the page`);
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      return {
        code: rect('button.room-code'),
        share: rect('ion-button.share-btn'),
        qr: rect('ion-button.qr-btn'),
        roster: rect('.participants-card'),
      };
    });

    // Under the code, above the roster, side by side.
    for (const button of [box.share, box.qr]) {
      expect(button.top).toBeGreaterThanOrEqual(box.code.bottom);
      expect(button.bottom).toBeLessThanOrEqual(box.roster.top);
    }
    expect(Math.abs(box.share.top - box.qr.top)).toBeLessThan(1);
    expect(box.share.right).toBeLessThanOrEqual(box.qr.left);
  });
});
