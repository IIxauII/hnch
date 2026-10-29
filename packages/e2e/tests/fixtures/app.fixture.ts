import { test as base, expect as pwExpect, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  JOIN,
  LOBBY,
  ROUND_FIELD,
  ROUND_START,
  ESTIMATING,
  expectToast,
  SETTINGS_SHEET,
  SCALE_PICKER,
  SESSION_TOOLBAR,
  KICK_AFFORDANCE,
  APP_SETTINGS,
  APP_SETTINGS_SCALE_PICKER,
  PRESET_CARD_EDITOR,
  fillRoomCode,
} from './helpers';

// ---------------------------------------------------------------------------
// Surface-agnostic menu helpers
// ---------------------------------------------------------------------------

/**
 * Click a named item in a menu that is already opening — the host's ⋯ menu,
 * a roster row's, or an agenda item's.
 *
 * On mobile (action-sheet): finds `ion-action-sheet button` with matching text.
 * On desktop (popover): `ion-item[button]` inside `ion-popover` renders its
 * interactive surface as a native button in shadow DOM. Playwright's getByRole()
 * pierces shadow DOM and finds it by accessible name (the item text).
 * Scoped to `ion-popover` to avoid matching unrelated buttons on the page.
 *
 * Ordering invariant: the overlay must already be opening when this is called
 * (caller clicks the trigger button first).
 */
export async function clickMenuOption(page: Page, text: string): Promise<void> {
  const actionSheetBtn = page.locator(`ion-action-sheet button:has-text("${text}")`);
  // ion-item[button] renders a native <button> in shadow DOM; getByRole() pierces shadow.
  // Scoped to ion-popover so unrelated page buttons don't match. Exact, so
  // "Move up" can never pick "Move up" out of a longer label.
  const popoverContainer = page.locator('ion-popover');
  const popoverBtn = popoverContainer.getByRole('button', { name: text, exact: true });

  // Promise.any: resolves as soon as one overlay becomes visible; rejects only if both fail.
  await Promise.any([
    actionSheetBtn.waitFor({ state: 'visible', timeout: 5_000 }),
    popoverBtn.waitFor({ state: 'visible', timeout: 5_000 }),
  ]);

  const isActionSheet = await actionSheetBtn.isVisible().catch(() => false);
  if (isActionSheet) {
    await actionSheetBtn.click();
  } else {
    await popoverBtn.click();
  }
}

// ---------------------------------------------------------------------------
// Scale label normalization
// ---------------------------------------------------------------------------

// Maps caller-provided scale names to the exact text rendered by formatScaleId()
// in the scale-picker template. Angular [value] bindings set DOM properties,
// not HTML attributes, so selectors must match by visible text instead.
const SCALE_DISPLAY_LABELS: Record<string, string> = {
  fibonacci: 'Fibonacci',
  Fibonacci: 'Fibonacci',
  't-shirt': 'T-shirt',
  'T-Shirt': 'T-shirt',
  'T-shirt': 'T-shirt',
  'powers-of-2': 'Powers of 2',
  'Powers of 2': 'Powers of 2',
  linear: 'Linear (1\u201310)',
  Linear: 'Linear (1\u201310)',
  risk: 'Risk',
  Risk: 'Risk',
};

function resolveScaleDisplayLabel(label: string): string {
  return SCALE_DISPLAY_LABELS[label] ?? label;
}

// ---------------------------------------------------------------------------
// Participant — page-object wrapper around a single browser context
// ---------------------------------------------------------------------------

export class Participant {
  constructor(
    private context: BrowserContext,
    public page: Page,
    private readonly displayName: string,
  ) {}

  // -- Onboarding -----------------------------------------------------------

  /** Complete the onboarding flow by entering a display name. */
  async onboard(): Promise<void> {
    await this.page.waitForURL(/\/onboarding/);
    const input = this.page.locator(ONBOARDING.nameInput);
    // Ionic wraps <input> inside shadow DOM of ion-input.
    // Use .fill() which works through shadow DOM in Playwright.
    await input.locator('input').fill(this.displayName);
    // Tap Continue, and tap again if the tap did not navigate.
    //
    // Why a retry: on an iPhone-emulated page Ionic's input shim reacts to
    // the fill() focus by scrolling ion-content ~25 px for an assumed 290 px
    // keyboard. A click that starts during that scroll aims at the button's
    // old centre, lands on div.page-container below it, and never reaches
    // submit() (#550). Playwright's two-frame stability check misses the
    // movement on a slow runner. A lost tap leaves the page on /onboarding
    // with Continue still enabled, so repeating it is safe; once the name is
    // saved the URL guard skips the click. The retry lands after the layout
    // has settled. A Continue that is really broken still fails: every
    // attempt must navigate, and the last error is reported when `toPass`
    // gives up.
    await pwExpect(async () => {
      if (!/\/home/.test(this.page.url())) {
        await this.page.locator(ONBOARDING.continueBtn).click({ timeout: 3_000 });
      }
      await pwExpect(this.page).toHaveURL(/\/home/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await this.page.waitForURL(/\/home/);
  }

  // -- Session lifecycle ----------------------------------------------------

  /** Create a new session from /home. Returns the room code. */
  async createSession(): Promise<string> {
    await this.page.goto(`${BASE_URL}/home`);
    await this.page.waitForURL(/\/(home|onboarding)/);
    if (this.page.url().includes('/onboarding')) {
      await this.onboard();
    }
    await this.page.locator(HOME.createCard).click();
    await this.page.waitForURL(/\/lobby/);
    const codeEl = this.page.locator(LOBBY.roomCode);
    await codeEl.waitFor({ state: 'visible' });
    const code = await codeEl.textContent();
    if (!code) throw new Error('Room code not found on lobby page');
    return code.replaceAll(/[^A-Z0-9]/gi, ''); // strip dash formatting
  }

  /**
   * Join an existing session from /home using a room code. Typing the sixth
   * character submits; there is no Join tap.
   */
  async joinSession(code: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/home`);
    await this.page.waitForURL(/\/(home|onboarding)/);
    if (this.page.url().includes('/onboarding')) {
      await this.onboard();
    }
    await this.page.locator(HOME.joinCard).click();
    await this.page.waitForURL(/\/join/);
    await fillRoomCode(this.page, code);
    await this.page.waitForURL(/\/lobby/);
  }

  // -- Lobby actions --------------------------------------------------------

  /** Tap "Start round N" and confirm the modal. */
  async startRound(title?: string, ticketId?: string): Promise<void> {
    // Scope to the active Ionic page so a hidden /join in the navigation
    // stack can't intercept the click via pointer-event bubbling.
    const startRoundBtn = this.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startRoundBtn.waitFor({ state: 'visible' });
    await startRoundBtn.click();
    // Wait for the round-start modal to appear
    const modal = this.page.locator('app-round-start-sheet');
    await modal.waitFor({ state: 'visible' });
    if (title) {
      await modal.getByRole('textbox', { name: ROUND_FIELD.title }).fill(title);
    }
    if (ticketId) {
      await modal.getByRole('textbox', { name: ROUND_FIELD.ticketId }).fill(ticketId);
    }
    const startBtn = this.page.locator(ROUND_START.startBtn);
    await startBtn.waitFor({ state: 'visible' });
    await startBtn.click();
    // Wait for the round-start sheet to fully dismiss. Ionic leaves the
    // ion-modal in the DOM with show-modal + full viewport size during
    // the closing animation; callers that then dispatch keyboard events
    // (vs .click() which auto-waits for actionability) would otherwise
    // race the still-present modal overlay.
    await modal.waitFor({ state: 'hidden' });
    await this.waitForEstimating();
  }

  /**
   * Wait for auto-navigation to /estimating (non-host clients) AND for the
   * Ionic page transition to complete.
   *
   * `waitForURL` resolves on router URL change, which fires before Ionic
   * finishes the slide-in animation. During the animation the new
   * `<app-estimating>` carries `.ion-page-invisible` (opacity: 0). Playwright's
   * `state: 'visible'` check ignores opacity, so subsequent clicks land on
   * an element that is technically in the DOM but mid-transition — and the
   * Angular signal-based change detection / Y.doc projection rebuild that
   * fires alongside the route change can leave handlers reading transient
   * state. Manifested as a flake in `revote-role-toggle.spec.ts` where the
   * role-chip click fired but `DocService.toggleRole` silently bailed
   * because the participant lookup raced the projection rebuild.
   *
   * Waiting for `:not(.ion-page-invisible):not(.ion-page-hidden)` ensures
   * the page is the active, fully-transitioned page before we return.
   */
  async waitForEstimating(): Promise<void> {
    await this.page.waitForURL(/\/estimating/, { timeout: 10_000 });
    // After URL change, Ionic keeps the previous page in the router-outlet
    // stack until the slide-in animation finishes — meanwhile both old and
    // new `<app-estimating>` are non-hidden and visible. Wait until exactly
    // one active page remains (Ionic adds `.ion-page-hidden` to the stale
    // one when the transition completes) AND that page no longer carries
    // `.ion-page-invisible` (opacity:0 pre-animation state).
    const active = this.page.locator(
      'app-estimating:not(.ion-page-hidden):not(.ion-page-invisible)',
    );
    await pwExpect(active).toHaveCount(1, { timeout: 10_000 });
  }

  // -- Voting ---------------------------------------------------------------

  /** Tap a card to cast (or change) a vote. */
  async castVote(value: string): Promise<void> {
    await this.page.locator(ESTIMATING.card(value)).first().click();
  }

  /** Tap the "Abstain this round" button on the Estimating page. */
  async abstain(): Promise<void> {
    await this.page.locator(ESTIMATING.abstainBtn).first().click();
  }

  /** Toggle role between voter and viewer on the estimating page. */
  async toggleRole(): Promise<void> {
    // The switch reads either "Voter" or "Observer".
    // .first() ensures we target the active (topmost) app-estimating page in the Ionic stack
    const chip = this.page
      .locator(ESTIMATING.roleChip)
      .filter({ hasText: /Voter|Observer/ })
      .first();
    await chip.waitFor({ state: 'visible' });
    await chip.click();
  }

  /** Tap the "Reveal votes" button (host only). Navigates to /lobby with results.
   * Idempotent: if unanimous auto-reveal (ADR-0018) already navigated to /lobby
   * before this is called, just waits for the results section.
   */
  async reveal(): Promise<void> {
    if (!/\/lobby/.test(this.page.url())) {
      const revealBtn = this.page.locator(ESTIMATING.revealBtn);
      try {
        await revealBtn.click({ timeout: 2_000 });
      } catch {
        // Auto-reveal raced us — navigation already in flight, button detached.
      }
      await this.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    }
    await this.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });
  }

  /**
   * Open the host's ⋯ menu on the active page (Lobby or Estimating). Everyone
   * else has no menu — their one action, Leave, is a toolbar button.
   */
  async openHostMenu(): Promise<void> {
    await this.activePage().getByRole('button', { name: SESSION_TOOLBAR.menuBtn }).click();
  }

  /**
   * The Lobby or Estimating page the user is on. Picked by URL, not by
   * `:not(.ion-page-hidden)` alone: while a page transition runs, the page
   * being left is still unhidden and both would match.
   */
  private activePage() {
    const onEstimating = this.page.url().includes('/estimating');
    return this.page.locator(
      onEstimating ? 'app-estimating:not(.ion-page-hidden)' : 'app-lobby:not(.ion-page-hidden)',
    );
  }

  /**
   * Tap the ⋯ menu, "Skip round", and confirm (host only). Navigates to
   * /lobby with the skipped label.
   */
  async skipRound(): Promise<void> {
    await this.openHostMenu();
    await clickMenuOption(this.page, 'Skip round');
    await this.confirmAlert('Skip round');
    await this.page.waitForURL(/\/lobby/, { timeout: 10_000 });
  }

  // -- Lobby results actions -------------------------------------------------

  /** Tap "Next round N" in the lobby footer and confirm the modal. */
  async nextRound(title?: string, ticketId?: string): Promise<void> {
    await this.page.locator('ion-button', { hasText: LOBBY.nextRoundBtn }).click();
    const modal = this.page.locator('app-round-start-sheet');
    await modal.waitFor({ state: 'visible' });
    if (title) {
      await modal.getByRole('textbox', { name: ROUND_FIELD.title }).fill(title);
    }
    if (ticketId) {
      await modal.getByRole('textbox', { name: ROUND_FIELD.ticketId }).fill(ticketId);
    }
    const startBtn = this.page.locator(ROUND_START.startBtn);
    await startBtn.waitFor({ state: 'visible' });
    await startBtn.click();
    // Wait for the round-start sheet to fully dismiss. Ionic leaves the
    // ion-modal in the DOM with show-modal + full viewport size during
    // the closing animation; callers that then dispatch keyboard events
    // (vs .click() which auto-waits for actionability) would otherwise
    // race the still-present modal overlay.
    await modal.waitFor({ state: 'hidden' });
    await this.waitForEstimating();
  }

  /** Tap "Re-vote" in the lobby footer — navigates to /estimating. */
  async revote(): Promise<void> {
    await this.page.locator(LOBBY.revoteBtn).click();
    await this.waitForEstimating();
  }

  // -- Settings (from lobby) ------------------------------------------------

  /** Open session settings sheet from the lobby subtitle button (host only). */
  async openSettings(): Promise<void> {
    await this.page.locator(LOBBY.subtitleHostBtn).click();
    await this.page.locator('app-session-settings-sheet').waitFor({ state: 'visible' });
  }

  /** Change the estimation scale. Assumes settings sheet is open. */
  async changeScale(scaleLabel: string): Promise<void> {
    await this.page.locator(SETTINGS_SHEET.scaleRow).click();
    await this.page.locator(SCALE_PICKER.option(scaleLabel)).click();
    const doneBtn = this.page.locator(SCALE_PICKER.doneBtn);
    await doneBtn.waitFor({ state: 'visible' });
    await doneBtn.click();
  }

  /** The relay's answer to the next access change made from this page. */
  private accessChangeAccepted(): Promise<unknown> {
    return this.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH' && res.ok(),
      { timeout: 10_000 },
    );
  }

  /**
   * Set or change the session password. Assumes settings sheet is open.
   * Resolves once the relay has accepted it — its answer to *this* change,
   * not the toast, which may still be up from the change before.
   */
  async setPassword(password: string): Promise<void> {
    const accepted = this.accessChangeAccepted();
    const input = this.page.locator(SETTINGS_SHEET.passwordInput).locator('input');
    await input.fill(password);
    // Enter commits, the same as leaving the field.
    await input.press('Enter');
    await accepted;
    await expectToast(this.page, 'Password set');
  }

  /**
   * Remove the session password. Assumes settings sheet is open and the
   * session has one. Resolves once the relay has accepted it.
   */
  async removePassword(): Promise<void> {
    const accepted = this.accessChangeAccepted();
    await this.page.locator(SETTINGS_SHEET.removePasswordBtn).click();
    await accepted;
    await expectToast(this.page, 'Password removed');
  }

  /** Join with a password — enters code, waits for password field, fills it. */
  async joinSessionWithPassword(code: string, password: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/home`);
    await this.page.waitForURL(/\/(home|onboarding)/);
    if (this.page.url().includes('/onboarding')) {
      await this.onboard();
    }
    await this.page.locator(HOME.joinCard).click();
    await this.page.waitForURL(/\/join/);
    // The sixth character resolves the code and reveals the password field
    await fillRoomCode(this.page, code);
    const pwInput = this.page.locator(JOIN.passwordInput).locator('input');
    await pwInput.waitFor({ state: 'visible', timeout: 5_000 });
    await pwInput.fill(password);
    // Join connects with the password
    await this.page.locator(JOIN.joinBtn).click();
    await this.page.waitForURL(/\/lobby/, { timeout: 10_000 });
  }

  /** Join via deep-link URL (/join?code=...). */
  async joinViaDeepLink(code: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/join?code=${code}`);
    await this.page.waitForURL(/\/(join|onboarding)/);
    if (this.page.url().includes('/onboarding')) {
      // Can't use onboard() here — it waits for /home, but the
      // pending-join-URL flow resumes to /join?code=... instead.
      const input = this.page.locator(ONBOARDING.nameInput).locator('input');
      await input.fill(this.displayName);
      await this.page.locator(ONBOARDING.continueBtn).click();
      await this.page.waitForURL(/\/(join|lobby)/);
    }
    // Deep-link auto-submit fires on JoinPage activation (ADR-0026 §3).
    // Wait for lobby content as success signal — works for both first-time
    // (onboarding redirect → JoinPage auto-submit) and returning-user paths.
    await this.page.locator(LOBBY.roomCode).waitFor({ state: 'visible', timeout: 10_000 });
  }

  /** Close the session settings sheet. */
  async closeSettings(): Promise<void> {
    const doneBtn = this.page.locator(SETTINGS_SHEET.doneBtn);
    await doneBtn.waitFor({ state: 'visible' });
    await doneBtn.click();
    // Wait for modal dismiss animation
    await this.page.locator('app-session-settings-sheet').waitFor({ state: 'hidden' });
  }

  /**
   * Leave the current session → confirm. Navigates to /home. The host leaves
   * through the ⋯ menu; everyone else has a Leave button in the toolbar.
   */
  async leaveSession(): Promise<void> {
    const active = this.activePage();
    const menuBtn = active.getByRole('button', { name: SESSION_TOOLBAR.menuBtn });
    const leaveBtn = active.getByRole('button', { name: SESSION_TOOLBAR.leaveBtn });
    await menuBtn.or(leaveBtn).first().waitFor({ state: 'visible' });

    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      // Works for both action-sheet (mobile) and popover (desktop)
      await clickMenuOption(this.page, 'Leave session');
    } else {
      await leaveBtn.click();
    }

    // Confirm in alert
    const alert = this.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    const confirmBtn = this.page.locator('ion-alert button:has-text("Leave")');
    await confirmBtn.click();

    // Navigate to /home
    await this.page.waitForURL(/\/home/, { timeout: 5_000 });
  }

  // -- Host actions on a participant --------------------------------------

  /**
   * Open the ⋯ menu on a participant's roster row (host only). An action
   * sheet on touch, a popover with a pointer — `clickMenuOption` handles both.
   */
  async openParticipantMenu(name: string): Promise<void> {
    const btn = this.page.locator(KICK_AFFORDANCE.menuBtn(name));
    await btn.waitFor({ state: 'visible', timeout: 5_000 });
    await btn.click();
  }

  /**
   * Remove a participant from the session: ⋯ → Remove → confirm.
   *
   * Ordering invariant: the alert is awaited before the confirm tap, so the
   * menu → alert hand-off is complete when the confirm lands.
   */
  async removeParticipant(name: string): Promise<void> {
    await this.openParticipantMenu(name);
    await clickMenuOption(this.page, 'Remove');
    await this.confirmAlert('Remove');
  }

  /** Hand the host role to a participant: ⋯ → Make host → confirm. */
  async makeHost(name: string): Promise<void> {
    await this.openParticipantMenu(name);
    await clickMenuOption(this.page, 'Make host');
    await this.confirmAlert('Make host');
  }

  /** Wait for the confirmation alert and tap the button labelled `text`. */
  async confirmAlert(text: string): Promise<void> {
    const alert = this.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    const confirmBtn = alert.locator(`button:has-text("${text}")`);
    await pwExpect(confirmBtn).toHaveCount(1);
    await confirmBtn.click();
  }

  // -- App settings (device-level preferences) -----

  /** Navigate to the app settings page (/settings). */
  async navigateToAppSettings(): Promise<void> {
    await this.page.goto(`${BASE_URL}/settings`);
    await this.page.waitForURL(/\/settings/);
  }

  /** Open the default scale picker and select a builtin scale by its label. */
  async setDefaultScale(scaleLabel: string): Promise<void> {
    await this.page.locator(APP_SETTINGS.defaultScaleRow).click();
    const displayLabel = resolveScaleDisplayLabel(scaleLabel);
    await this.page.locator(APP_SETTINGS_SCALE_PICKER.scaleRadio(displayLabel)).click();
    const doneBtn = this.page.locator(APP_SETTINGS_SCALE_PICKER.doneBtn);
    await doneBtn.waitFor({ state: 'visible' });
    await doneBtn.click();
    // Wait for modal dismiss animation
    await this.page.locator('app-scale-picker-sheet').waitFor({ state: 'hidden' });
  }
  /** Toggle a preset scale card on or off. */
  async togglePresetCard(presetLabel: string, cardValue: string): Promise<void> {
    await this.page.locator(APP_SETTINGS.defaultScaleRow).click();

    const displayLabel = resolveScaleDisplayLabel(presetLabel);
    const editBtn = this.page.locator(APP_SETTINGS_SCALE_PICKER.editBtn(displayLabel));
    await editBtn.waitFor({ state: 'visible' });
    await editBtn.click();

    // Wait for the scale editor to appear
    await this.page.locator('app-scale-editor-sheet').waitFor({ state: 'visible' });

    // Click the toggle for the target card
    const cardToggle = this.page.locator(PRESET_CARD_EDITOR.cardToggle(cardValue));
    await cardToggle.waitFor({ state: 'visible' });
    await cardToggle.click();

    // Close the editor
    const doneBtn = this.page.locator(PRESET_CARD_EDITOR.doneBtn);
    await doneBtn.waitFor({ state: 'visible' });
    await doneBtn.click();
    await this.page.locator('app-scale-editor-sheet').waitFor({ state: 'hidden' });

    // Close the scale picker
    const pickerDoneBtn = this.page.locator(APP_SETTINGS_SCALE_PICKER.doneBtn);
    await pickerDoneBtn.waitFor({ state: 'visible' });
    await pickerDoneBtn.click();
    await this.page.locator('app-scale-picker-sheet').waitFor({ state: 'hidden' });
  }

  // -- Agenda ---------------------------------------------------------------

  /** The agenda list on the active Lobby. One layout on every surface. */
  private agendaList() {
    return this.page.locator(
      'app-lobby:not(.ion-page-hidden) app-agenda-panel ion-list.agenda-list',
    );
  }

  /** The add / edit story sheet, and the fields on it. */
  private agendaForm() {
    const sheet = this.page.locator('app-agenda-item-form-sheet');
    return {
      sheet,
      title: sheet.locator('ion-title'),
      titleInput: sheet.locator('ion-input[formcontrolname="title"] input').first(),
      ticketInput: sheet.locator('ion-input[formcontrolname="ticketId"] input').first(),
      descriptionInput: sheet
        .locator('ion-textarea[formcontrolname="description"] textarea')
        .first(),
      submit: sheet.locator('ion-buttons[slot="end"] ion-button'),
    };
  }

  /**
   * Add a story to the agenda via the host-only "Add story" button and form
   * sheet. At least one of `title` or `ticketId` is required by the validator.
   */
  async addAgendaItem(input: {
    title?: string;
    ticketId?: string;
    description?: string;
  }): Promise<void> {
    // Wait for lobby host status established (isHost() = true required for add button).
    // Start Round button is the reliable proxy — it only shows for the host.
    const startBtn = this.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startBtn.waitFor({ state: 'visible', timeout: 10_000 });

    const addBtn = this.page.locator(
      'app-lobby:not(.ion-page-hidden) app-agenda-panel ion-button.add-btn',
    );
    await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addBtn.click();

    // Wait for the form sheet dialog to appear (Ionic modal opens asynchronously).
    // Use the dialog title text as a reliable signal that the sheet is ready.
    const form = this.agendaForm();
    await form.title.waitFor({ state: 'visible', timeout: 10_000 });

    if (input.title !== undefined) await form.titleInput.fill(input.title);
    if (input.ticketId !== undefined) await form.ticketInput.fill(input.ticketId);
    if (input.description !== undefined) await form.descriptionInput.fill(input.description);

    await form.submit.click();
    // Wait for sheet to close — the ion-title disappears when modal dismisses.
    await form.title.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  /**
   * Assert visible agenda items match expected list (in order).
   * Each entry can specify `title` (text content), `ticketId` (badge text),
   * or `state` (`pending` | `consumed` | `skipped` | `cancelled`).
   *
   * Removed (cancelled) items are hidden by default; pass `state:'cancelled'`
   * only after toggling "Show removed".
   */
  async expectAgendaItems(
    expected: Array<{ title?: string; ticketId?: string; state?: string }>,
  ): Promise<void> {
    const { expect } = await import('@playwright/test');
    const list = this.agendaList();
    await list.waitFor({ state: 'visible' });
    const items = list.locator('ion-item.agenda-item');
    await expect(items).toHaveCount(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i]!;
      const item = items.nth(i);
      if (exp.title !== undefined) {
        await expect(item.locator('span.item-title')).toContainText(exp.title);
      }
      if (exp.ticketId !== undefined) {
        await expect(item.locator('ion-badge.ticket-badge')).toContainText(exp.ticketId);
      }
      if (exp.state !== undefined) {
        await expect(item).toHaveClass(new RegExp(`agenda-item--${exp.state}`));
      }
    }
  }

  /**
   * Open the ⋯ menu of the nth agenda item (0-based) and pick an action:
   * `Move up`, `Move down`, `Edit`, `Skip` or `Remove`. Host only, and only
   * on a story that is still pending.
   */
  async agendaItemAction(index: number, action: string): Promise<void> {
    const item = this.agendaList().locator('ion-item.agenda-item').nth(index);
    const menuBtn = item.locator('ion-button.item-menu-btn');
    await menuBtn.waitFor({ state: 'visible' });
    await menuBtn.click();
    await clickMenuOption(this.page, action);
  }

  /**
   * Open the edit form for the nth agenda item (0-based) and apply a patch.
   * `fill` replaces whatever the field held.
   */
  async editAgendaItem(
    index: number,
    patch: { title?: string; ticketId?: string; description?: string },
  ): Promise<void> {
    await this.agendaItemAction(index, 'Edit');

    const form = this.agendaForm();
    await form.title.waitFor({ state: 'visible', timeout: 10_000 });

    if (patch.title !== undefined) await form.titleInput.fill(patch.title);
    if (patch.ticketId !== undefined) await form.ticketInput.fill(patch.ticketId);
    if (patch.description !== undefined) await form.descriptionInput.fill(patch.description);

    await form.submit.click();
    await form.title.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  /**
   * Remove the nth agenda item (0-based). The item is soft-deleted
   * (state='cancelled') and hidden from the default view.
   */
  async cancelAgendaItem(index: number): Promise<void> {
    await this.agendaItemAction(index, 'Remove');
  }

  /**
   * Skip the nth agenda item (0-based). Sets state='skipped' without
   * creating a round.
   */
  async skipAgendaItem(index: number): Promise<void> {
    await this.agendaItemAction(index, 'Skip');
  }

  /** Move the nth agenda item (0-based) one position up or down. */
  async reorderAgendaItem(index: number, dir: 'up' | 'down'): Promise<void> {
    await this.agendaItemAction(index, dir === 'up' ? 'Move up' : 'Move down');
  }

  /** Assert which story carries the "Next" badge — the one a round picks up. */
  async expectNextAgendaItem(expectedTitle: string): Promise<void> {
    const { expect } = await import('@playwright/test');
    const next = this.agendaList().locator('ion-item.agenda-item:has(ion-badge.next-badge)');
    await expect(next).toHaveCount(1);
    await expect(next.locator('span.item-title')).toContainText(expectedTitle);
  }

  // -- Disconnect / reconnect -----------------------------------------------

  /** Simulate disconnect by closing the page (abrupt; awareness clears via WS close). */
  async disconnect(): Promise<void> {
    await this.page.close();
  }

  /** Reconnect: open a new page in the same context and join via code. */
  async reconnect(code: string): Promise<void> {
    this.page = await this.context.newPage();
    await this.page.goto(`${BASE_URL}/home`);
    await this.page.waitForURL(/\/(home|onboarding)/);
    if (this.page.url().includes('/onboarding')) {
      // Same context, so onboarding should be skipped (localStorage persists)
      // But if somehow needed:
      await this.onboard();
    }
    await this.page.locator(HOME.joinCard).click();
    await this.page.waitForURL(/\/join/);
    // The sixth character submits.
    await fillRoomCode(this.page, code);
    // After joining, the player lands on /lobby. If there's an active
    // round the lobby's auto-navigate effect may redirect to /estimating.
    await this.page.waitForURL(/\/(lobby|estimating)/, { timeout: 10_000 });
  }

  // -- Assertions -----------------------------------------------------------

  /**
   * Assert the lobby results section shows the given vote values (unordered).
   * Waits for /lobby and for the results section to appear.
   */
  async expectRevealedVotes(expected: string[]): Promise<void> {
    await this.page.waitForURL(/\/lobby/);
    const resultsSection = this.page.locator(LOBBY.resultsSection);
    await resultsSection.waitFor({ state: 'visible', timeout: 10_000 });
    const cards = this.page.locator(LOBBY.groupCard);
    await cards.first().waitFor({ state: 'visible' });
    // Collect all card values from vote groups (scoped to results section)
    const allChips: string[] = [];
    const groupCount = await this.page.locator(LOBBY.voteGroups).count();
    for (let i = 0; i < groupCount; i++) {
      const group = this.page.locator(LOBBY.voteGroups).nth(i);
      const cardValue = await group.locator('.card').textContent();
      const chipLabels = await group.locator('ion-chip ion-label').allTextContents();
      for (const _ of chipLabels) {
        allChips.push(cardValue?.trim() ?? '');
      }
    }
    const sorted = [...allChips].toSorted();
    const expectedSorted = [...expected].toSorted();
    if (sorted.join(',') !== expectedSorted.join(',')) {
      throw new Error(`Expected votes [${expectedSorted}] but got [${sorted}]`);
    }
  }

  /** Assert votes are hidden (on the estimating page). */
  async expectVotesHidden(): Promise<void> {
    // On the estimating page, there is no revealed data — just dot indicators
    // Verify we are on estimating (not revealed, no results section visible)
    const url = this.page.url();
    if (!url.includes('/estimating')) {
      throw new Error(`Expected to be on /estimating but URL is ${url}`);
    }
    // Ensure results section (shown after reveal) is not visible
    await this.page.locator('.results-section').waitFor({ state: 'hidden' });
  }

  /** Assert this participant sees host controls. */
  async expectIsHost(): Promise<void> {
    // Host sees "Reveal votes" on estimating or "Start round" / "Next round" on lobby
    const url = this.page.url();
    if (url.includes('/estimating')) {
      await this.page.locator(ESTIMATING.revealBtn).waitFor({ state: 'visible' });
    } else if (url.includes('/lobby')) {
      // Either Start Round or Next Round button is visible for host
      const startBtn = this.page.locator('ion-button', { hasText: LOBBY.startRoundBtn });
      const nextBtn = this.page.locator('ion-button', { hasText: LOBBY.nextRoundBtn });
      const startVisible = await startBtn.isVisible().catch(() => false);
      const nextVisible = await nextBtn.isVisible().catch(() => false);
      if (!startVisible && !nextVisible) {
        throw new Error('Expected host controls to be visible on lobby');
      }
    }
  }

  /**
   * Assert the Abstained group is visible in lobby results and contains
   * each of the given names. Waits for the group to appear (Yjs sync).
   */
  async expectAbstained(names: string[]): Promise<void> {
    const group = this.page.locator(LOBBY.abstainedGroup);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    for (const name of names) {
      await pwExpect(group.getByText(name, { exact: false })).toBeVisible();
    }
  }

  /** Assert participant count shown in lobby. */
  async expectParticipantCount(n: number): Promise<void> {
    const { expect } = await import('@playwright/test');
    // Ionic's router outlet briefly keeps two app-lobby instances in DOM
    // during forward/back navigation transitions (neither gets ion-page-hidden
    // until the animation settles). Wait until only one non-hidden lobby
    // remains before asserting, so strict-mode doesn't fire on the transient
    // duplicate (reproduced in back-button-soft-exit after banner tap returns
    // to the same lobby URL).
    await expect(this.page.locator(LOBBY.participantCount)).toHaveCount(1, { timeout: 5_000 });
    await expect(this.page.locator(LOBBY.participantCount)).toContainText(`(${n})`);
  }
}

// ---------------------------------------------------------------------------
// Fixture definition
// ---------------------------------------------------------------------------

interface AppFixtures {
  host: Participant;
  player: Participant;
  /** Factory for tests that need more than 2 participants. */
  createParticipant: (name: string) => Promise<Participant>;
}

/**
 * Wire a fail-fast guard onto a page that records any uncaught script error
 * or `console.error('hnch bootstrap failed', ...)`. The fixture's `use()`
 * wrapper later asserts the array is empty so a bootstrap regression aborts
 * the test instead of letting every locator burn the 20s test timeout
 * against a blank app-root.
 *
 * Throwing inside `page.on()` listeners doesn't reliably surface as a test
 * failure across Playwright versions — collecting and asserting at teardown
 * is the canonical pattern.
 *
 * History: PR #84 shipped an `inject()`-after-await in the AccentService
 * APP_INITIALIZER. Bootstrap rejected → blank page → 73 tests × 20s ≈ full
 * 10-min CI cap. This guard plus 0-bootstrap-smoke.spec.ts turns that class
 * of regression into a fast, readable failure.
 */
function attachBootstrapGuard(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(`Uncaught page error: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('hnch bootstrap failed') || text.includes('NG0203')) {
      errors.push(`App bootstrap error: ${text}`);
    }
  });
  return errors;
}

function assertNoBootstrapErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Bootstrap guard tripped:\n  - ${errors.join('\n  - ')}`);
  }
}

async function clearStorage(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // addInitScript fires on every frame navigation including sandboxed iframes
    // (e.g. Ionic modal frames) where localStorage access throws SecurityError.
    // Guard: bail out if localStorage is not accessible.
    try {
      void localStorage.length;
    } catch {
      return;
    }

    // Preserve all user-identity and device-preference keys written by the
    // app under the CapacitorStorage prefix. Only session-bleed keys (last
    // session cache, room state) should be cleared. List what to KEEP so
    // future keys default to preserved unless explicitly opted out.
    const KEEP = new Set([
      'CapacitorStorage.hnch.displayName',
      'CapacitorStorage.hnch.pendingJoinUrl',
      'CapacitorStorage.hnch.participantId', // ParticipantIdService stable device ID
      'CapacitorStorage.hnch.presetOverrides',
      'CapacitorStorage.hnch.customScales',
      'CapacitorStorage.hnch.defaultScaleId',
      'CapacitorStorage.hnch.defaultSessionName',
      'CapacitorStorage.hnch.defaultPassword',
      'CapacitorStorage.hnch.relayHttpUrl',
      'CapacitorStorage.hnch.lastSession',
      '_capuid', // Capacitor Device plugin web fallback UUID
    ]);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && !KEEP.has(key)) localStorage.removeItem(key);
    }
  });
}

export const test = base.extend<AppFixtures>({
  host: async ({ browser }, use) => {
    const context = await browser.newContext();
    await clearStorage(context);
    const page = await context.newPage();
    const errors = attachBootstrapGuard(page);
    const host = new Participant(context, page, 'Host');
    await use(host);
    await context.close();
    assertNoBootstrapErrors(errors);
  },

  player: async ({ browser }, use) => {
    const context = await browser.newContext();
    await clearStorage(context);
    const page = await context.newPage();
    const errors = attachBootstrapGuard(page);
    const player = new Participant(context, page, 'Player');
    await use(player);
    await context.close();
    assertNoBootstrapErrors(errors);
  },

  createParticipant: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    const errorBuckets: string[][] = [];
    const factory = async (name: string): Promise<Participant> => {
      const context = await browser.newContext();
      await clearStorage(context);
      contexts.push(context);
      const page = await context.newPage();
      errorBuckets.push(attachBootstrapGuard(page));
      return new Participant(context, page, name);
    };
    await use(factory);
    for (const ctx of contexts) {
      await ctx.close();
    }
    for (const errors of errorBuckets) {
      assertNoBootstrapErrors(errors);
    }
  },
});

export { expect } from '@playwright/test';
