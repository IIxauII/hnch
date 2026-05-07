import { test, expect } from './fixtures/app.fixture'
import { LOBBY, expectToast } from './fixtures/helpers'

/**
 * Helper: open ⋯ overflow popover and trigger "End session for everyone" flow.
 *
 * Phase 2 (ADR-0039): ActionSheet replaced by ion-popover anchored to the ⋯
 * button. Items are ion-item elements inside app-overflow-menu.
 */
async function endSessionForEveryone(
  page: import('@playwright/test').Page,
): Promise<void> {
  // Scope to the active session page to avoid strict-mode violations when
  // Ionic keeps the previous page (app-home) in the DOM during transitions.
  const url = page.url()
  const pageScope = url.includes('/estimating')
    ? 'app-estimating:not(.ion-page-hidden)'
    : 'app-lobby:not(.ion-page-hidden)'
  const overflowBtn = page
    .locator(`${pageScope} ion-header`)
    .getByRole('button', { name: 'More options' })
  await overflowBtn.evaluate((el: HTMLElement) => el.click())

  const popover = page.locator('ion-popover')
  await popover.waitFor({ state: 'visible', timeout: 5_000 })

  // Use text-based selector to pierce Ionic's web component attribute reflection.
  const endOption = popover.getByRole('listitem').filter({ hasText: 'End session for everyone' })
  await endOption.evaluate((el: HTMLElement) => el.click())

  const alert = page.locator('ion-alert')
  await alert.waitFor({ state: 'visible', timeout: 5_000 })

  const confirmBtn = page.locator('ion-alert button:has-text("End session")')
  await confirmBtn.evaluate((el: HTMLElement) => el.click())
}

test.describe('End session for everyone', () => {
  test('host ends session → host navigates to Home', async ({ host }) => {
    await host.createSession()
    await host.page.waitForURL(/\/lobby/)

    await endSessionForEveryone(host.page)

    await host.page.waitForURL(/\/home/, { timeout: 10_000 })
    expect(host.page.url()).toContain('/home')
  })

  test('host ends session → joiner navigates to Home', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    await host.page.waitForURL(/\/lobby/)
    await player.page.waitForURL(/\/lobby/)

    await endSessionForEveryone(host.page)

    // Both clients land on /home
    await host.page.waitForURL(/\/home/, { timeout: 10_000 })
    await player.page.waitForURL(/\/home/, { timeout: 10_000 })

    expect(host.page.url()).toContain('/home')
    expect(player.page.url()).toContain('/home')
  })

  test('host ends session — joiner sees "Session ended" toast', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    await host.page.waitForURL(/\/lobby/)
    await player.page.waitForURL(/\/lobby/)

    await endSessionForEveryone(host.page)

    // Wait for joiner to land on home
    await player.page.waitForURL(/\/home/, { timeout: 10_000 })

    // Toast with "Session ended" text should appear on the joiner's page
    await expectToast(player.page, /session ended/i)
  })

  test('host ends session during active round — joiner navigates to Home', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    await host.startRound()
    await player.waitForEstimating()

    await host.castVote('5')
    await player.castVote('8')

    // End session while on estimating page
    await endSessionForEveryone(host.page)

    await host.page.waitForURL(/\/home/, { timeout: 10_000 })
    await player.page.waitForURL(/\/home/, { timeout: 10_000 })

    expect(host.page.url()).toContain('/home')
    expect(player.page.url()).toContain('/home')
  })

  test('"End session for everyone" is NOT visible to joiner (non-host)', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    await host.page.waitForURL(/\/lobby/)
    await player.page.waitForURL(/\/lobby/)

    // Open overflow popover on joiner (Phase 2: popover replaces action sheet).
    // Scope to active lobby page — Ionic keeps app-home in DOM during transitions.
    const overflowBtn = player.page
      .locator('app-lobby:not(.ion-page-hidden) ion-header')
      .getByRole('button', { name: 'More options' })
    await overflowBtn.evaluate((el: HTMLElement) => el.click())

    const popover = player.page.locator('ion-popover')
    await popover.waitFor({ state: 'visible', timeout: 5_000 })

    // "End session for everyone" must not be present for non-host.
    const endOption = popover.getByRole('listitem').filter({ hasText: 'End session for everyone' })
    await expect(endOption).not.toBeVisible()

    // Dismiss via Escape.
    await player.page.keyboard.press('Escape')
    await popover.waitFor({ state: 'hidden', timeout: 5_000 })
  })

  test('cancel on confirmation alert keeps session alive', async ({ host }) => {
    await host.createSession()
    await host.page.waitForURL(/\/lobby/)

    // Open overflow popover (Phase 2: popover replaces action sheet).
    // Scope to active lobby page — Ionic keeps app-home in DOM during transitions.
    const overflowBtn = host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-header')
      .getByRole('button', { name: 'More options' })
    await overflowBtn.evaluate((el: HTMLElement) => el.click())

    const popover = host.page.locator('ion-popover')
    await popover.waitFor({ state: 'visible', timeout: 5_000 })

    const endOption = popover.getByRole('listitem').filter({ hasText: 'End session for everyone' })
    await endOption.evaluate((el: HTMLElement) => el.click())

    const alert = host.page.locator('ion-alert')
    await alert.waitFor({ state: 'visible', timeout: 5_000 })

    const cancelBtn = host.page.locator('ion-alert button:has-text("Cancel")')
    await cancelBtn.evaluate((el: HTMLElement) => el.click())

    await alert.waitFor({ state: 'hidden', timeout: 5_000 })

    // Still on /lobby
    await host.page.waitForURL(/\/lobby/)
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible()
  })
})
