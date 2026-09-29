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
  createCard: 'ion-item:has(h3:text-is("New session"))',
  joinCard: 'ion-item:has(h3:text-is("Join session"))',
  /** One row per session this device can jump back into, newest first. */
  recentRow: 'app-recent-rooms-list ion-item.recent-room-row',
  /** The × beside a row: forget the session on this device. */
  recentRemoveBtn: 'app-recent-rooms-list ion-button.remove-btn',
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
  /**
   * The password row. Addressed by its label rather than `type="password"`:
   * the show/hide toggle flips the type.
   */
  passwordInput: 'app-join ion-input[label="Password"]',
  scanQrBtn: 'app-join ion-button.scan-btn',
  joinBtn: 'app-join ion-button.join-btn',
} as const;

/**
 * Type a room code into the segmented join-code input. Focuses the
 * first tile and types characters one at a time so the component's
 * onInput handler advances focus to the next tile after each character.
 *
 * The sixth character submits the form: an open session goes straight to the
 * lobby, a protected one reveals the password field. There is no Join tap
 * after a typed code.
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
  // Host renders the summary line as a tappable button (opens session
  // settings). Non-host renders it as plain text (no settings affordance).
  // Selector matches both so role-agnostic reads work; host-only click
  // helpers should use `subtitleHostBtn` explicitly.
  subtitle: 'button.subtitle, .subtitle-chip',
  subtitleHostBtn: 'button.subtitle',
  participantList: 'ion-list.participants',
  participantItems: 'ion-list.participants ion-item',
  /** Heading of the roster card: "Participants (3)". */
  participantCount: 'app-lobby:not(.ion-page-hidden) .participants-card .lobby-section__heading',
  hostIcon: '.host-icon',
  /** Host-only ⋯ on another participant's row. */
  participantMenuBtn: 'ion-list.participants ion-button.participant-menu-btn',
  /** Shown to everyone but the host, where the host has the round button. */
  waitingNote: 'app-lobby:not(.ion-page-hidden) .waiting-note',
  startRoundBtn: /Start round \d+/,
  /** Results section shown after a round is revealed */
  resultsSection: '.results-section',
  resultsHeading: 'app-lobby:not(.ion-page-hidden) .results-heading',
  voteGroups: '.results-section ion-item-group.group:not(.didnt-vote)',
  groupCard: '.results-section ion-item-group .card',
  voterChips: '.results-section ion-chip ion-label',
  didntVoteGroup: '.results-section ion-item-group.didnt-vote',
  /** Abstained group shown after reveal when at least one participant abstained. */
  abstainedGroup: '.results-section ion-item-group.group.abstained',
  revoteBtn: 'ion-button:has-text("Re-vote")',
  nextRoundBtn: /Next round \d+/,
} as const;

/** The toolbar's trailing buttons on Lobby and Estimating. */
export const SESSION_TOOLBAR = {
  /** Host only. */
  menuBtn: 'More options',
  /** Everyone else: one tap, then a confirmation. */
  leaveBtn: 'Leave session',
} as const;

// ---------------------------------------------------------------------------
// QR display modal
// ---------------------------------------------------------------------------
export const QR_MODAL = {
  showBtn: 'app-lobby:not(.ion-page-hidden) ion-button.qr-btn',
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
 * the animation to settle. On desktop the modal renders as a centered dialog
 * (no breakpoints), so `setCurrentBreakpoint` is a no-op there. On mobile,
 * expanding to 0.95 reveals the full form content for screenshot captures.
 * The Start / Cancel buttons are in the header toolbar and are visible at
 * any breakpoint, so expansion is no longer required to reach them.
 * Call once after `app-round-start-sheet` becomes visible.
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
 * Click the round-start header Start button and wait for navigation to
 * `/estimating`. Uses dispatchEvent for reliability across viewport sizes.
 * Call after `app-round-start-sheet` is visible.
 */
export async function clickRoundStartSubmit(page: Page): Promise<void> {
  const btn = page.locator(ROUND_START.startBtn);
  await btn.waitFor({ state: 'visible' });
  // dispatchEvent is used for reliability across viewport sizes — the Start
  // button now lives in the header toolbar (always visible at the 0.6
  // breakpoint), so no layout workaround is needed, but dispatchEvent remains
  // consistent with how other submit helpers work across this test suite.
  await btn.dispatchEvent('click');
  await page.waitForURL(/\/estimating/, { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Estimating
// ---------------------------------------------------------------------------
export const ESTIMATING = {
  /** "Round N", in the toolbar. */
  roundTitle: 'app-estimating:not(.ion-page-hidden) ion-title',
  /** What is being estimated: the round's title. */
  descriptor: 'app-estimating:not(.ion-page-hidden) .descriptor',
  elapsed: 'p.elapsed',
  cardGrid: 'div.grid',
  card: (value: string) => `app-estimating ion-card.card:has(ion-card-content:text-is("${value}"))`,
  selectedCard: 'ion-card.card.selected',
  voteDots: 'app-avatar-vote-row .dot',
  votedDots: 'app-avatar-vote-row .dot.voted',
  voteCount: 'app-estimating:not(.ion-page-hidden) app-avatar-vote-row .count',
  revealBtn: 'ion-button:has-text("Reveal votes")',
  /** Voter ⇄ Observer switch. Text is "Voter" or "Observer". */
  roleChip: 'app-estimating:not(.ion-page-hidden) app-role-toggle ion-button',
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
  scaleValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale")) ion-note',
  /** Typing here and leaving the field sets the password. */
  passwordInput: 'app-session-settings-sheet ion-input[label="Password"]',
  /** Only there while the session has a password. */
  removePasswordBtn: 'app-session-settings-sheet ion-button.remove-password-btn',
  /** One line under the list saying who can get in. */
  accessHint: 'app-session-settings-sheet ion-note.helper',
  doneBtn: 'app-session-settings-sheet ion-button:has-text("Done")',
} as const;

export const SCALE_PICKER = {
  option: (label: string) => `app-scale-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  doneBtn: 'app-scale-picker-sheet ion-button:has-text("Done")',
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
  /** Password input on the join page (appears once the typed code resolves to a protected session). */
  passwordInput: JOIN.passwordInput,
  /** Error text shown after wrong-password rejection (WS close 4002). */
  errorText: 'p.error-text, ion-note.error, .join-error',
} as const;

// ---------------------------------------------------------------------------
// Viewer role toggle
// ---------------------------------------------------------------------------
export const VIEWER_ROLE = {
  /**
   * Role switch on the estimating page. Text is "Voter" or "Observer".
   * Use `.filter({ hasText: ... })` to assert specific state.
   */
  chip: ESTIMATING.roleChip,
} as const;

// ---------------------------------------------------------------------------
// Host actions on a participant (⋯ on their roster row → Make host / Remove)
// ---------------------------------------------------------------------------
export const KICK_AFFORDANCE = {
  /** A participant's roster row, by the name it shows. */
  row: (name: string) =>
    `app-lobby:not(.ion-page-hidden) ion-list.participants ion-item:has(.participant-name:text-is("${name}"))`,
  /** The ⋯ button on that row. Host only, never on the host's own row. */
  menuBtn: (name: string) =>
    `app-lobby:not(.ion-page-hidden) ion-list.participants ion-item:has(.participant-name:text-is("${name}")) ion-button.participant-menu-btn`,
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
// Connection banner
// ---------------------------------------------------------------------------
// app-connection-status-banner renders its bar only while the session is not
// connected: "Reconnecting…" as soon as a connection that was up drops,
// "Connecting…" once a first connection is taking a while. Connected: no bar.
export const CONNECTION_BANNER = {
  host: 'app-connection-status-banner',
  banner: '[data-testid="connection-status-banner"]',
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
