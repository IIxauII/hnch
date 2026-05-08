import { test, expect } from './fixtures/app.fixture';
import { QR_MODAL } from './fixtures/helpers';

test.describe('QR display modal', () => {
  test('opens with QR image and room code, then dismisses via Done', async ({ host }) => {
    const code = await host.createSession();

    // Open the QR modal
    await host.page.locator(QR_MODAL.showBtn).click();

    // QR image is visible and contains a base64 data URL
    const img = host.page.locator(QR_MODAL.img);
    await img.waitFor({ state: 'visible', timeout: 5_000 });
    const src = await img.getAttribute('src');
    expect(src).toMatch(/^data:image\/png;base64,/);

    // Room code text is readable alongside the QR
    const codeText = await host.page.locator(QR_MODAL.codeText).textContent();
    expect(codeText?.replaceAll(/[^A-Z0-9]/gi, '')).toBe(code);

    // Dismiss via Done
    await host.page.locator(QR_MODAL.doneBtn).click();
    await host.page.locator('app-qr-display-sheet').waitFor({ state: 'hidden' });
  });
});
