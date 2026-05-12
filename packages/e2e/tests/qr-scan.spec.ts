import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, JOIN, ONBOARDING } from './fixtures/helpers';

/**
 * The Join page hides the "Scan QR code" entry when no `videoinput` device
 * exists (e.g. desktops without a webcam). CI's headless Chromium reports
 * zero cameras, so we install an init script that stubs
 * `navigator.mediaDevices.enumerateDevices` to control what the
 * `QrScannerService.isScanningAvailable()` check sees.
 */
async function stubCameras(
  page: import('@playwright/test').Page,
  devices: { kind: string }[],
): Promise<void> {
  await page.addInitScript((deviceList) => {
    const md = (navigator.mediaDevices ?? {}) as {
      enumerateDevices?: () => Promise<unknown>;
    };
    md.enumerateDevices = () => Promise.resolve(deviceList);
    Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
  }, devices);
}

async function gotoJoinPastOnboarding(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    const input = page.locator(ONBOARDING.nameInput).locator('input');
    await input.fill('Player');
    await page.locator(ONBOARDING.continueBtn).click();
    await page.waitForURL(/\/home/);
  }
  await page.goto(`${BASE_URL}/join`);
  await page.waitForURL(/\/join/);
}

test.describe('QR scan button on Join', () => {
  test('Scan QR code button is visible when a camera is present', async ({ player }) => {
    await stubCameras(player.page, [{ kind: 'videoinput' }]);
    await gotoJoinPastOnboarding(player.page);
    await expect(player.page.locator(JOIN.scanQrBtn)).toBeVisible();
  });

  test('Scan QR code button is hidden when no camera is present', async ({ player }) => {
    await stubCameras(player.page, []);
    await gotoJoinPastOnboarding(player.page);
    // canScanQr() resolves before the page is interactive; the entry should
    // never render. Use toHaveCount(0) so we don't depend on visibility timing.
    await expect(player.page.locator(JOIN.scanQrBtn)).toHaveCount(0);
  });
});
