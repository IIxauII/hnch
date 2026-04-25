import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

/**
 * Helper: open action sheet and trigger "End session for everyone" flow.
 * Opens the ⋯ menu, taps End session for everyone, then taps End session
 * in the confirmation alert.
 */
async function endSessionForEveryone(
  page: import('@playwright/test').Page,
): Promise<void> {
  const actionBtn = page.locator('ion-header').locator('ion-button').last()
  await actionBtn.evaluate((el: HTMLElement) => el.click())

  const actionSheet = page.locator('ion-action-sheet')
  await actionSheet.waitFor({ state: 'visible', timeout: 5_000 })

  const endOption = page.locator(
    'ion-action-sheet button:has-text("End session for everyone")',
  )
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
    const toast = player.page.locator('ion-toast')
    await toast.waitFor({ state: 'visible', timeout: 5_000 })
    const msg = await toast.getAttribute('message')
    expect(msg).toMatch(/session ended/i)
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

    // Open action sheet on joiner
    const actionBtn = player.page.locator('ion-header').locator('ion-button').last()
    await actionBtn.evaluate((el: HTMLElement) => el.click())

    const actionSheet = player.page.locator('ion-action-sheet')
    await actionSheet.waitFor({ state: 'visible', timeout: 5_000 })

    const endOption = player.page.locator(
      'ion-action-sheet button:has-text("End session for everyone")',
    )
    await expect(endOption).not.toBeVisible()

    // Dismiss
    const cancelBtn = player.page.locator('ion-action-sheet button:has-text("Cancel")')
    await cancelBtn.evaluate((el: HTMLElement) => el.click())
    await actionSheet.waitFor({ state: 'hidden', timeout: 5_000 })
  })

  test('cancel on confirmation alert keeps session alive', async ({ host }) => {
    await host.createSession()
    await host.page.waitForURL(/\/lobby/)

    const actionBtn = host.page.locator('ion-header').locator('ion-button').last()
    await actionBtn.evaluate((el: HTMLElement) => el.click())

    const actionSheet = host.page.locator('ion-action-sheet')
    await actionSheet.waitFor({ state: 'visible', timeout: 5_000 })

    const endOption = host.page.locator(
      'ion-action-sheet button:has-text("End session for everyone")',
    )
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
