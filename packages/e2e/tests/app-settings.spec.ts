import { test, expect } from './fixtures/app.fixture'
import {
  APP_SETTINGS,
  THEME_PICKER,
  NAME_EDITOR,
  APP_SETTINGS_SCALE_PICKER,
  HOME,
  LOBBY,
  SETTINGS_SHEET,
  ESTIMATING,
  BASE_URL,
} from './fixtures/helpers'
import type { Participant } from './fixtures/app.fixture'

/**
 * App Settings page — theme picker, display name editor, default scale,
 * and version display.
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

  // ---------------------------------------------------------------------------
  // Default Scale tests
  // ---------------------------------------------------------------------------

  test('set default scale in Settings → row updates to show new scale name', async ({
    host,
  }) => {
    await setupAndGoToSettings(host)

    // Default scale should initially be Fibonacci (default builtin)
    await expect(host.page.locator(APP_SETTINGS.defaultScaleValue)).toContainText('Fibonacci')

    // Open picker and select T-Shirt
    await host.setDefaultScale('T-Shirt')

    // Row should now show T-shirt
    await expect(host.page.locator(APP_SETTINGS.defaultScaleValue)).toContainText('T-shirt')
  })

  test('default scale persists across page reload', async ({ host }) => {
    await setupAndGoToSettings(host)

    // Set to Powers of 2
    await host.setDefaultScale('Powers of 2')
    await expect(host.page.locator(APP_SETTINGS.defaultScaleValue)).toContainText('Powers of 2')

    // Reload the page
    await host.page.reload()
    await host.page.waitForURL(/\/settings/)

    // Scale preference should persist
    await expect(host.page.locator(APP_SETTINGS.defaultScaleValue)).toContainText('Powers of 2')
  })

  test('new session uses default scale → lobby subtitle shows selected scale', async ({
    host,
  }) => {
    // Go to settings and set Linear as default
    await setupAndGoToSettings(host)
    await host.setDefaultScale('Linear')

    // Now create a new session
    await host.page.goto(`${BASE_URL}/home`)
    await host.page.waitForURL(/\/home/)
    await host.page.locator(HOME.createCard).click()
    await host.page.waitForURL(/\/lobby/)

    // Open session settings and verify scale is Linear
    await host.page.locator(LOBBY.subtitle).click()
    await host.page.locator('app-session-settings-sheet').waitFor({ state: 'visible' })

    // The session settings sheet should show Linear as the current scale
    const scaleNote = host.page.locator(SETTINGS_SHEET.scaleValue)
    await expect(scaleNote).toContainText('Linear')
  })

  test('session scale picker pre-selects the default scale', async ({ host }) => {
    // Set Risk as the default scale
    await setupAndGoToSettings(host)
    await host.setDefaultScale('Risk')

    // Create a new session
    await host.page.goto(`${BASE_URL}/home`)
    await host.page.waitForURL(/\/home/)
    await host.page.locator(HOME.createCard).click()
    await host.page.waitForURL(/\/lobby/)

    // Open session settings and then scale picker
    await host.page.locator(LOBBY.subtitle).click()
    await host.page.locator('app-session-settings-sheet').waitFor({ state: 'visible' })
    await host.page.locator(SETTINGS_SHEET.scaleRow).click()

    // The Risk radio should be pre-selected
    const riskRadio = host.page.locator(APP_SETTINGS_SCALE_PICKER.scaleRadio('Risk'))
    const isChecked = await riskRadio.evaluate((el: HTMLElement) => {
      return (el as any).checked
    })
    expect(isChecked).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Preset Modification tests
  // ---------------------------------------------------------------------------

  test('modify preset (toggle card off on Fibonacci) → reflected in session', async ({
    host,
  }) => {
    await setupAndGoToSettings(host)

    // First create a session with default Fibonacci to see all cards
    await host.page.goto(`${BASE_URL}/home`)
    await host.page.waitForURL(/\/home/)
    await host.page.locator(HOME.createCard).click()
    await host.page.waitForURL(/\/lobby/)

    // Verify the session uses Fibonacci scale
    let subtitleText = await host.page.locator(LOBBY.subtitle).textContent()
    expect(subtitleText).toContain('Fibonacci')

    // Go back to settings
    await host.page.goto(`${BASE_URL}/settings`)
    await host.page.waitForURL(/\/settings/)

    // Open default scale picker and toggle off the "0" card from Fibonacci
    await host.togglePresetCard('Fibonacci', '0')

    // Close the picker
    await host.page.waitForURL(/\/settings/)

    // Now create a new session
    await host.page.goto(`${BASE_URL}/home`)
    await host.page.waitForURL(/\/home/)
    await host.page.locator(HOME.createCard).click()
    await host.page.waitForURL(/\/lobby/)

    // Navigate to estimating to see the cards (any round will do)
    await host.startRound('Test round')
    await host.page.waitForURL(/\/estimating/)

    // The grid should NOT contain card "0" anymore
    const cardZero = host.page.locator(ESTIMATING.card('0'))
    await expect(cardZero).not.toBeVisible()

    // But card "1" should still be there
    const cardOne = host.page.locator(ESTIMATING.card('1'))
    await expect(cardOne).toBeVisible()
  })
})
