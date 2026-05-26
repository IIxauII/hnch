import { test, expect } from './fixtures/app.fixture';
import { ESTIMATING } from './fixtures/helpers';

/**
 * Fine-pointer-only hover affordance on Estimating cards (#326).
 *
 * Playwright's chromium project defaults to `(pointer: fine) and (hover: hover)`,
 * so the `hover-only` mixin's media query matches and the hover rule applies.
 * Asserts that an unselected, non-focused card picks up the
 * `--hnch-sep-strong` border colour when hovered.
 */
test.describe('Estimating card hover affordance', () => {
  test('unselected card shows sep-strong border on hover', async ({ host }) => {
    await host.createSession();
    await host.startRound();

    const cardLocator = host.page.locator(ESTIMATING.card('5')).first();
    await cardLocator.waitFor({ state: 'visible' });

    const expectedColor = await host.page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(
        '--hnch-sep-strong',
      );
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    });
    expect(expectedColor).not.toEqual('');

    // Move away first so we can capture the idle border baseline.
    await host.page.mouse.move(0, 0);
    const idleBorder = await cardLocator.evaluate((el) => getComputedStyle(el).borderTopColor);

    await cardLocator.hover();
    // CSS transition is 0.15s — wait one rAF past it.
    await host.page.waitForTimeout(200);
    const hoverBorder = await cardLocator.evaluate((el) => getComputedStyle(el).borderTopColor);

    expect(hoverBorder).not.toEqual(idleBorder);
    expect(hoverBorder).toEqual(expectedColor);
  });
});
