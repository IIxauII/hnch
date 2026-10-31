/** PROTOTYPE (#643). Entry and System scenes. Each one resets store.entry to what it needs. */
import type { Scene } from '../scenes';

export const ENTRY_SCENES: Scene[] = [
  {
    id: 'home-first-run',
    label: 'Home, first run: name inline, no onboarding',
    group: 'Entry',
    screen: 'home',
    setup: (s) => s.entry.set({ name: '', recent: 0 }),
    note: 'Type a name, press Enter: you are in your room. On desktop the name field has focus already.',
  },
  {
    id: 'home-returning',
    label: 'Home, returning: Recent (live, password, ended, expired)',
    group: 'Entry',
    screen: 'home',
    setup: (s) => s.entry.set({ name: 'Ana', recent: 4, cachedHash: true }),
    note: 'Each row is one button; × removes. Paste https://hnch.dev/join?code=K7P9MR into the code field.',
  },
  {
    id: 'home-stepped-out',
    label: "Home, stepped out: You're still in Sprint 42 · Return",
    group: 'Entry',
    screen: 'home',
    fixture: 'voting-partial',
    as: 'ana',
    setup: (s) => {
      s.entry.set({ name: 'Ana', recent: 2, cachedHash: true });
      s.model.stepOut();
    },
    note: 'Return = 1 tap. Start a room or tap Team Kiwi: "Leave Sprint 42 first?"',
  },
  {
    id: 'home-summary',
    label: 'Home after End: summary card + Run it back (host)',
    group: 'Entry',
    screen: 'home',
    fixture: 'ended',
    as: 'hana',
    setup: (s) => s.entry.set({ name: 'Hana', recent: 2 }),
    note: 'Copy summary, CSV, Run it back (same name and scale, leftovers queued) → Start.',
  },
  {
    id: 'home-summary-voter',
    label: 'Home after End: summary card (voter, no Run it back)',
    group: 'Entry',
    screen: 'home',
    fixture: 'ended',
    as: 'ana',
    setup: (s) => s.entry.set({ name: 'Ana', recent: 2 }),
  },
  {
    id: 'create-relay-down',
    label: 'Start a room, relay down: busy → error → Retry',
    group: 'Entry',
    screen: 'home',
    setup: (s) => s.entry.set({ name: 'Hana', recent: 0, relay: 'down' }),
    note: 'Press Start a room: "Starting…", then an inline error with Retry. Retry finds the relay back up.',
  },
  {
    id: 'create-password',
    label: 'Start a room with a password (inline, nothing to dismiss)',
    group: 'Entry',
    screen: 'home',
    setup: (s) => s.entry.set({ name: 'Hana', recent: 0, createPassword: true }),
    note: 'Plan §3.1 #5 cuts the create-time password (set it later in Room settings). This is the "if kept" variant: inline, so no sheet can orphan a room.',
  },
  {
    id: 'join-preview-new',
    label: 'Join preview, new invitee: "Join Sprint 42 · 5 people here"',
    group: 'Entry',
    screen: 'join',
    setup: (s) => s.entry.set({ joinCode: 'K7P9MR', name: '' }),
    note: 'Onboarding folded in: name + Join = 2 taps. Lands mid-round, straight into voting.',
  },
  {
    id: 'join-password',
    label: 'Join preview, password room',
    group: 'Entry',
    screen: 'join',
    setup: (s) => s.entry.set({ joinCode: 'B4Q7XT', name: 'Ana' }),
    note: 'Name prefilled, password focused. The prototype password is "kiwi".',
  },
  {
    id: 'join-wrong-password',
    label: 'Join, wrong password: stays here, field kept',
    group: 'Entry',
    screen: 'join',
    setup: (s) => s.entry.set({ joinCode: 'B4Q7XT', name: 'Ana', wrongPassword: true }),
    note: 'The Room never flashes. The field keeps its value, selected, so typing replaces it.',
  },
  {
    id: 'join-known-name',
    label: 'Invite link, known name: straight into the Room',
    group: 'Entry',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'kai',
    note: 'Opened /join?code=K7P9MR with a stored name and no password: no preview, lands in voting (1 tap to vote).',
  },
  {
    id: 'rejoin-cached-hash',
    label: 'Rejoin a password room from Recent: no prompt',
    group: 'Entry',
    screen: 'home',
    setup: (s) => s.entry.set({ name: 'Ana', recent: 2, cachedHash: true }),
    note: 'Tap Team Kiwi: the cached hash is passed, so you are back in with 1 tap.',
  },
  {
    id: 'host-reload-password-room',
    label: 'Host reloads a password room: back in as host',
    group: 'Entry',
    screen: 'join',
    setup: (s) => s.entry.set({ joinCode: 'B4Q7XT', name: 'Hana', resume: 'host' }),
    note: 'The hash was cached when the password was set, so the reload lands back in the Room as host.',
  },
  {
    id: 'system-light',
    label: 'Design system, light',
    group: 'System',
    screen: 'system',
    setup: (s) => {
      s.theme.set('light');
      s.entry.set({});
    },
    note: 'Every ratio is measured live from the CSS variables. Toggle O8 Dark fill in the lab and watch the dark column.',
  },
  {
    id: 'system-dark',
    label: 'Design system, dark',
    group: 'System',
    screen: 'system',
    setup: (s) => {
      s.theme.set('dark');
      s.entry.set({});
    },
    note: 'Tab into the Focus ring panels. Other scenes keep the theme you leave here.',
  },
];
