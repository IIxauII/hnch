import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

test.describe('Leave session flow', () => {
  test('host leaves session via action sheet → confirm → navigates to Home', async ({
    host,
  }) => {
    // Create a session
    const code = await host.createSession()
    expect(code).toMatch(/^[A-Z0-9]{6}$/)

    // Verify we are in the lobby
    await host.page.waitForURL(/\/lobby/)
    await host.expectParticipantCount(1)

    // Leave the session
    await host.leaveSession()

    // Verify we are on the home page
    expect(host.page.url()).toContain('/home')
  })

  test('after explicit leave, last session cache is cleared', async ({
    host,
  }) => {
    // Create a session
    await host.createSession()
    await host.page.waitForURL(/\/lobby/)

    // Leave the session
    await host.leaveSession()

    // Verify we are on home
    await host.page.waitForURL(/\/home/)

    // The "Jump back in" banner should NOT appear (last session was explicitly cleared)
    // Wait a moment for any potential banner to render
    await host.page.waitForTimeout(500)

    // Check that there's no jump-back-in banner/card
    // (The banner typically shows the room code from the last session)
    const jumpBackBanner = host.page.locator('ion-card:has-text("Jump back in")')
    const isVisible = await jumpBackBanner.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })

  test('cancel on leave alert dismisses dialog without leaving', async ({
    host,
  }) => {
    // Create a session
    const code = await host.createSession()
    await host.page.waitForURL(/\/lobby/)

    // Open action sheet
    const actionBtn = host.page.locator('ion-header').locator('ion-button').last()
    await actionBtn.evaluate((el: HTMLElement) => el.click())
    const actionSheet = host.page.locator('ion-action-sheet')
    await actionSheet.waitFor({ state: 'visible', timeout: 5_000 })

    // Tap "Leave session" with evaluate for stability
    const leaveOption = host.page.locator(
      'ion-action-sheet button:has-text("Leave session")',
    )
    await leaveOption.evaluate((el: HTMLElement) => el.click())

    // Alert appears
    const alert = host.page.locator('ion-alert')
    await alert.waitFor({ state: 'visible', timeout: 5_000 })

    // Cancel the alert
    const cancelBtn = host.page.locator('ion-alert button:has-text("Cancel")')
    await cancelBtn.evaluate((el: HTMLElement) => el.click())

    // Alert should dismiss
    await alert.waitFor({ state: 'hidden', timeout: 5_000 })

    // Should still be on /lobby
    await host.page.waitForURL(/\/lobby/)
    expect(host.page.url()).toContain('/lobby')

    // Room code should still be visible
    const roomCode = host.page.locator(LOBBY.roomCode)
    await expect(roomCode).toBeVisible()
  })
})
