/**
 * Centralized selectors and constants for hnch e2e tests.
 *
 * Every UI selector lives here so that template changes only
 * require a single-file update.
 */

import type { Page } from '@playwright/test';

export async function expectToast(
  page: Page,
  message: RegExp | string,
  opts?: { timeout?: number },
): Promise<void> {
  await page.waitForFunction(
    ({ pattern, flags, isRegex }: { pattern: string; flags: string; isRegex: boolean }) => {
      const toasts = Array.from(document.querySelectorAll('ion-toast:not(.overlay-hidden)'));
      return toasts.some((t) => {
        const msg = (t as unknown as { message?: string }).message ?? '';
        if (isRegex) return new RegExp(pattern, flags).test(msg);
        return msg === pattern || msg.includes(pattern);
      });
    },
    {
      pattern: typeof message === 'string' ? message : message.source,
      flags: message instanceof RegExp ? message.flags : '',
      isRegex: message instanceof RegExp,
    },
    { timeout: opts?.timeout ?? 5_000 },
  );
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------
export const ONBOARDING = {
  nameInput: 'ion-input[autocapitalize="words"]',
  continueBtn: 'ion-button:has-text("Continue")',
} as const;

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
export const HOME = {
  createCard: 'ion-item:has(h2:text-is("Create Room"))',
  joinCard: 'ion-item:has(h2:text-is("Join Room"))',
} as const;

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------
export const JOIN = {
  /**
   * Segmented 6-tile code input. Each tile is `<input maxlength="1">`,
   * so use {@link fillRoomCode} to type characters one at a time —
   * native `.fill()` is clamped to one tile by the maxlength attribute.
   */
  codeInput: 'app-segmented-code-input',
  passwordInput: 'ion-input[type="password"]',
  scanQrBtn: 'ion-item:has-text("Scan QR code")',
  joinBtn: 'ion-button:has-text("Join")',
} as const;

/**
 * Type a room code into the segmented join-code input. Focuses the
 * first tile and types characters one at a time so the component's
 * onInput handler advances focus to the next tile after each character.
 */
export async function fillRoomCode(page: Page, code: string): Promise<void> {
  const firstTile = page.locator(JOIN.codeInput).locator('input').first();
  await firstTile.focus();
  await page.keyboard.type(code);
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------
export const LOBBY = {
  roomCode: 'button.room-code',
  roomCodeText: 'button.room-code span',
  // Host renders subtitle as a tappable button (opens session settings).
  // Non-host renders as a read-only ion-chip (no settings affordance).
  // Selector matches both so role-agnostic reads work; host-only click
  // helpers should use `subtitleHostBtn` explicitly.
  subtitle: 'button.subtitle, ion-chip.subtitle-chip',
  subtitleHostBtn: 'button.subtitle',
  participantList: 'ion-list.participants',
  participantItems: 'ion-list.participants ion-item',
  participantCount: 'ion-accordion[value="participants"] ion-item[slot="header"] ion-label',
  hostIcon: '.host-icon',
  startRoundBtn: /Start Round \d+/,
  /** Results section shown after a round is revealed */
  resultsSection: '.results-section',
  resultsHeading: 'ion-accordion[value="results"] .lobby-section__heading',
  voteGroups: '.results-section ion-item-group.group:not(.didnt-vote)',
  groupCard: '.results-section ion-item-group .card',
  voterChips: '.results-section ion-chip ion-label',
  didntVoteGroup: '.results-section ion-item-group.didnt-vote',
  /** Abstained group shown after reveal when at least one participant abstained. */
  abstainedGroup: '.results-section ion-item-group.group.abstained',
  revoteBtn: 'ion-button:has-text("Re-vote")',
  nextRoundBtn: /Next Round \d+/,
} as const;

// ---------------------------------------------------------------------------
// QR display modal
// ---------------------------------------------------------------------------
export const QR_MODAL = {
  showBtn: 'ion-item:has-text("Show QR code")',
  img: 'app-qr-display-sheet img',
  codeText: 'app-qr-display-sheet .room-code',
  doneBtn: 'app-qr-display-sheet ion-button:has-text("Done")',
} as const;

// ---------------------------------------------------------------------------
// Round-start modal
// ---------------------------------------------------------------------------
export const ROUND_START = {
  /** Round title input. Ionic projects the wrapper's aria-label to the inner native input, so we address it there. */
  titleInput: 'app-round-start-sheet ion-input:has(input[aria-label="Round title"])',
  /** Ticket ID input (optional tracker reference). */
  ticketIdInput: 'app-round-start-sheet ion-input:has(input[aria-label="Ticket ID"])',
  startBtn: 'app-round-start-sheet ion-button:has-text("Start")',
} as const;

/**
 * Drive the round-start `<ion-modal>` to its top breakpoint and wait for
 * the animation to settle. On mobile (`initialBreakpoint=0.6`), Playwright's
 * click on the Start button races with the drag-handle / backdrop layer
 * and silently dismisses the sheet without navigating — `waitForURL`
 * then hangs the entire test timeout. On desktop, the modal renders as
 * a centered dialog (no breakpoints), so `setCurrentBreakpoint` is a
 * no-op there. Call once after `app-round-start-sheet` becomes visible.
 */
export async function expandRoundStartSheet(page: Page): Promise<void> {
  await page.locator('app-round-start-sheet').waitFor({ state: 'visible' });
  const modal = page.locator('app-round-start-sheet').locator('xpath=ancestor::ion-modal');
  await modal.evaluate(
    async (el: HTMLElement & { setCurrentBreakpoint?: (b: number) => Promise<void> }) => {
      if (typeof el.setCurrentBreakpoint === 'function') {
        await el.setCurrentBreakpoint(0.95);
      }
    },
  );
  await page.waitForTimeout(400);
}

/**
 * Click the round-start footer Start button and wait for navigation to
 * `/estimating`. Uses force + dispatchEvent to bypass the bottom-sheet
 * actionability race that intermittently dismisses the sheet without
 * navigating on mobile viewports. Call after the title input has been
 * filled and blurred.
 */
export async function clickRoundStartSubmit(page: Page): Promise<void> {
  const btn = page.locator(ROUND_START.startBtn);
  await btn.waitFor({ state: 'visible' });
  // Dispatch click programmatically — on mobile viewports the bottom-sheet
  // footer can render the Start button just below the visible scroll area
  // (`outside of the viewport` even after scrollIntoViewIfNeeded), and
  // `force: true` doesn't skip Playwright's viewport check. dispatchEvent
  // fires the click on the element directly, which Angular/Ionic handle
  // identically to a real tap for purposes of the click handler.
  await btn.dispatchEvent('click');
  await page.waitForURL(/\/estimating/, { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Estimating
// ---------------------------------------------------------------------------
export const ESTIMATING = {
  roundTitle: 'h1.title',
  elapsed: 'p.elapsed',
  cardGrid: 'div.grid',
  card: (value: string) => `app-estimating ion-card.card:has(ion-card-content:text-is("${value}"))`,
  selectedCard: 'ion-card.card.selected',
  voteDots: 'app-avatar-vote-row .dot',
  votedDots: 'app-avatar-vote-row .dot.voted',
  voteCount: 'app-estimating:not(.ion-page-hidden) app-avatar-vote-row .count',
  revealBtn: 'ion-button:has-text("Reveal Votes")',
  roleChip: 'app-estimating:not(.ion-page-hidden) ion-header ion-chip',
  /** Abstain button on the estimating page. */
  abstainBtn:
    'app-estimating ion-button.abstain-btn, app-estimating ion-button[aria-label="Abstain this round"]',
  /** Card grid when the current user has abstained (grid gets class="grid abstained"). */
  cardGridAbstained: 'app-estimating div.grid.abstained',
} as const;

// ---------------------------------------------------------------------------
// Session settings
// ---------------------------------------------------------------------------
export const SETTINGS_SHEET = {
  scaleRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale"))',
  accessRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Access"))',
  scaleValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale")) ion-note',
  accessValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Access")) ion-note',
  doneBtn: 'app-session-settings-sheet ion-button:has-text("Done")',
} as const;

export const SCALE_PICKER = {
  option: (label: string) => `app-scale-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  doneBtn: 'app-scale-picker-sheet ion-button:has-text("Done")',
} as const;

export const ACCESS_PICKER = {
  option: (label: string) => `app-access-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  passwordInput: 'app-access-picker-sheet ion-input[type="password"]',
  doneBtn: 'app-access-picker-sheet ion-button:has-text("Done")',
} as const;

// ---------------------------------------------------------------------------
// App settings (settings page, not session settings)
// ---------------------------------------------------------------------------
// Display name + default session name use inline ion-input (blur-save).
// Theme + accent use ion-select interface="popover" — Ionic auto-creates
// an ion-select-popover with ion-radio rows when the trigger is clicked.
export const APP_SETTINGS = {
  nameInput: 'app-settings ion-input[label="Display name"]',
  themeSelect: 'app-settings ion-select[label="Theme"]',
  accentSelect: 'app-settings ion-select[label="Accent"]',
  defaultScaleRow: 'app-settings ion-item:has(ion-label:text-is("Default scale"))',
  defaultScaleValue: 'app-settings ion-item:has(ion-label:text-is("Default scale")) ion-note',
  versionValue: 'app-settings ion-item:has(ion-label:text-is("Version")) ion-note',
} as const;

/** ion-select-popover option row, addressed by the visible label text. */
export const SELECT_POPOVER = {
  option: (label: string) => `ion-select-popover ion-radio:has-text("${label}")`,
} as const;

// ---------------------------------------------------------------------------
// App settings scale picker (picker mode - builtin scales only)
// ---------------------------------------------------------------------------
// Selectors use display label text (h3) because Angular [value] bindings set
// DOM properties, not HTML attributes, so CSS [value="..."] doesn't match.
export const APP_SETTINGS_SCALE_PICKER = {
  scaleRadio: (label: string) => `app-scale-picker-sheet ion-radio:has(h3:text-is("${label}"))`,
  scaleItem: (label: string) => `app-scale-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  editBtn: (label: string) =>
    `app-scale-picker-sheet ion-item:has(h3:text-is("${label}")) ion-button`,
  doneBtn: 'app-scale-picker-sheet ion-button:has-text("Done")',
} as const;

// ---------------------------------------------------------------------------
// Preset card toggle editor (scale-editor-sheet)
// ---------------------------------------------------------------------------
export const PRESET_CARD_EDITOR = {
  cardToggle: (cardFace: string) =>
    `app-scale-editor-sheet ion-item:has(h3:text-is("${cardFace}")) ion-toggle`,
  doneBtn: 'app-scale-editor-sheet ion-button:has-text("Done")',
  cardList: 'app-scale-editor-sheet ion-list',
} as const;

// ---------------------------------------------------------------------------
// Password sheet (join page — password prompt + error display)
// ---------------------------------------------------------------------------
export const PASSWORD_SHEET = {
  /** Password input on the join page (appears after first join submit on a pwd-protected room). */
  passwordInput: 'ion-input[type="password"]',
  /** Error text shown after wrong-password rejection (WS close 4002). */
  errorText: 'p.error-text, ion-note.error, .join-error',
} as const;

// ---------------------------------------------------------------------------
// Viewer role toggle
// ---------------------------------------------------------------------------
export const VIEWER_ROLE = {
  /**
   * Role chip on the estimating page. Text is "Voter" or "Observing".
   * Use `.filter({ hasText: ... })` to assert specific state.
   */
  chip: ESTIMATING.roleChip,
} as const;

// ---------------------------------------------------------------------------
// Kick affordance (swipe-left → Remove on participant row)
// ---------------------------------------------------------------------------
export const KICK_AFFORDANCE = {
  /** IonItemSliding wrapping a participant row — call `.open('end')` via evaluate(). */
  slidingItem: (name: string) =>
    `ion-item-sliding:has(ion-label:text-is("${name}"), ion-label:has-text("${name}"))`,
  /** Remove option button revealed after swipe. */
  removeBtn: 'ion-item-option:has-text("Remove")',
} as const;

// ---------------------------------------------------------------------------
// Custom scale editor (scale-editor-sheet)
// ---------------------------------------------------------------------------
// Entry path: App Settings → Default scale row → Edit button next to a preset.
// Selector for the sheet itself; card toggles use PRESET_CARD_EDITOR.
export const CUSTOM_SCALE_EDITOR = {
  sheet: 'app-scale-editor-sheet',
  cardList: PRESET_CARD_EDITOR.cardList,
  cardToggle: PRESET_CARD_EDITOR.cardToggle,
  doneBtn: PRESET_CARD_EDITOR.doneBtn,
} as const;

// ---------------------------------------------------------------------------
// Session-ended toast
// ---------------------------------------------------------------------------
// Use expectToast(page, /session ended/i) from helpers.ts for assertions.
// Selector for the visible ion-toast element (if direct DOM access is needed).
export const SESSION_ENDED_TOAST = {
  toast: 'ion-toast:not(.overlay-hidden)',
} as const;

// ---------------------------------------------------------------------------
// Connection chip
// ---------------------------------------------------------------------------
// app-connection-chip renders an ion-chip.connection-chip only when non-connected.
// States: "Connecting…" (medium, sync-outline) | "Reconnecting…" (warning, cloud-offline).
// Connected state: chip not rendered (null from computeChipDisplay).
export const CONNECTION_CHIP = {
  host: 'app-connection-chip',
  chip: 'app-connection-chip ion-chip.connection-chip',
  reconnecting: 'app-connection-chip ion-chip.connection-chip[color="warning"]',
  connecting: 'app-connection-chip ion-chip.connection-chip[color="medium"]',
} as const;

// ---------------------------------------------------------------------------
// Round history
// ---------------------------------------------------------------------------
// app-round-history renders content only when entries.length > 0; the lobby
// only mounts the component when there is at least one past revealed round,
// so the host element absence is the empty-state signal.
export const ROUND_HISTORY = {
  section: 'app-round-history',
  items: 'app-round-history ul.history-list li.history-item',
  skippedItem: 'app-round-history li.history-item.skipped',
} as const;

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
export const BASE_URL =
  process.env['PLAYWRIGHT_BASE_URL'] ?? `http://localhost:${process.env['CLIENT_PORT'] ?? 4200}`;
