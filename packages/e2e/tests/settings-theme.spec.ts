import { test, expect } from './fixtures/app.fixture'
import { APP_SETTINGS, THEME_PICKER, NAME_EDITOR, BASE_URL } from './fixtures/helpers'
import type { Participant } from './fixtures/app.fixture'

/**
 * App Settings page — theme picker, display name editor, version display.
 *
 * These tests use a single participant (no relay needed for local
 * preference changes). Navigate directly to /settings after onboarding.
 */
test.describe('App Settings', () => {
  /** Onboard then navigate to /settings. */
  async function setupAndGoToSettings(p: Participant): Promise<void> {
    await p.page.goto(`${BASE_URL}/home`)
    await p.page.waitForURL(/\/(home|onboarding)/)
    if (p.page.url().includes('/onboarding')) {
      await p.onboard()
    }
    await p.page.goto(`${BASE_URL}/settings`)
    await p.page.waitForURL(/\/settings/)
  }

  test('theme picker cycles through Dark → Light → System', async ({ host }) => {
    await setupAndGoToSettings(host)

    // Default theme should be "System"
    await expect(host.page.locator(APP_SETTINGS.themeValue)).toContainText('System')

    // Switch to Dark
    await host.page.locator(APP_SETTINGS.themeRow).click()
    await host.page.locator(THEME_PICKER.option('Dark')).click()
    // Verify class added
    const hasDarkClass = await host.page.evaluate(() =>
      document.documentElement.classList.contains('ion-palette-dark'),
    )
    expect(hasDarkClass).toBe(true)

    // Close picker
    const doneBtnDark = host.page.locator(THEME_PICKER.doneBtn)
    await doneBtnDark.waitFor({ state: 'visible' })
    await doneBtnDark.evaluate((el: HTMLElement) => el.click())

    // Theme label updated
    await expect(host.page.locator(APP_SETTINGS.themeValue)).toContainText('Dark')

    // Switch to Light
    await host.page.locator(APP_SETTINGS.themeRow).click()
    await host.page.locator(THEME_PICKER.option('Light')).click()

    const hasDarkClassAfterLight = await host.page.evaluate(() =>
      document.documentElement.classList.contains('ion-palette-dark'),
    )
    expect(hasDarkClassAfterLight).toBe(false)

    const doneBtnLight = host.page.locator(THEME_PICKER.doneBtn)
    await doneBtnLight.waitFor({ state: 'visible' })
    await doneBtnLight.evaluate((el: HTMLElement) => el.click())

    await expect(host.page.locator(APP_SETTINGS.themeValue)).toContainText('Light')

    // Switch to System
    await host.page.locator(APP_SETTINGS.themeRow).click()
    await host.page.locator(THEME_PICKER.option('System')).click()

    const doneBtnSystem = host.page.locator(THEME_PICKER.doneBtn)
    await doneBtnSystem.waitFor({ state: 'visible' })
    await doneBtnSystem.evaluate((el: HTMLElement) => el.click())

    await expect(host.page.locator(APP_SETTINGS.themeValue)).toContainText('System')
  })

  test('display name change persists across settings re-entry', async ({ host }) => {
    await setupAndGoToSettings(host)

    // Current name should be "Host" (from fixture)
    await expect(host.page.locator(APP_SETTINGS.nameValue)).toContainText('Host')

    // Open name editor and change
    await host.page.locator(APP_SETTINGS.nameRow).click()
    const nameInput = host.page.locator(NAME_EDITOR.input).locator('input')
    await nameInput.waitFor({ state: 'visible' })
    await nameInput.fill('NewHost')
    const doneBtn = host.page.locator(NAME_EDITOR.doneBtn)
    await doneBtn.waitFor({ state: 'visible' })
    await doneBtn.evaluate((el: HTMLElement) => el.click())

    // Verify label updated
    await expect(host.page.locator(APP_SETTINGS.nameValue)).toContainText('NewHost')

    // Navigate back and re-enter settings
    await host.page.goto(`${BASE_URL}/settings`)
    await host.page.waitForURL(/\/settings/)

    // Name should persist
    await expect(host.page.locator(APP_SETTINGS.nameValue)).toContainText('NewHost')
  })

  test('settings page shows version string', async ({ host }) => {
    await setupAndGoToSettings(host)

    await expect(host.page.locator(APP_SETTINGS.versionValue)).toContainText('0.1.0')
  })
})
