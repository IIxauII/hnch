/** PROTOTYPE (#643). Room chrome scenes: header, rail, every overlay, toasts. */
import type { ProtoStore } from '../proto-store';
import type { Scene } from '../scenes';

/** Keep the current toast (and its Undo window) up long enough to look at. */
function holdToast(s: ProtoStore) {
  const later = Date.now() + 60_000;
  for (const n of s.model.state.notices) n.expiresAt = later;
  for (const p of s.model.state.pending) p.commitAt = later;
  s.bump();
}

const G = 'Room · overlays';

export const CHROME_SCENES: Scene[] = [
  {
    id: 'ov-menu-host',
    label: 'Menu ⋯ (host, voting)',
    group: G,
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    frame: 'phone',
    overlay: 'menu',
    note: 'One level, one row each. Leave and End are red text only, after a divider.',
  },
  {
    id: 'ov-menu-voter',
    label: 'Menu ⋯ (voter): no Room settings, no End',
    group: G,
    screen: 'room',
    fixture: 'voting-partial',
    as: 'ana',
    frame: 'phone',
    overlay: 'menu',
  },
  {
    id: 'ov-invite',
    label: 'Invite sheet (phone)',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'phone',
    overlay: 'invite',
    note: 'Code, Share link, Copy link, QR with quiet zone, CLI line. No scanner.',
  },
  {
    id: 'ov-invite-desktop',
    label: 'Invite dialog (desktop, sized to content)',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'desktop',
    overlay: 'invite',
    note: 'Desktop copies the link (one toast); it never opens the OS share sheet.',
  },
  {
    id: 'ov-people-host',
    label: 'People (host, ⋮ open on Sam)',
    group: G,
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    frame: 'phone',
    overlay: 'people',
    overlayArg: 'sam',
    note: 'Make host / Remove… per row. Your own ⋮ has Just watching and Edit name.',
  },
  {
    id: 'ov-people-tablet',
    label: 'People as a side sheet (tablet)',
    group: G,
    screen: 'room',
    fixture: 'voting-partial',
    as: 'ana',
    frame: 'tablet',
    overlay: 'people',
    overlayArg: 'ana',
  },
  {
    id: 'ov-people-collision',
    label: 'People: two people share a colour',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'phone',
    overlay: 'people',
    setup: (s) => {
      const sam = s.model.person('sam');
      if (sam) sam.color = 'blue';
      s.bump();
    },
    note: "Sam picked Ana's blue: Sam's dot gets a dashed ring. Switch Theme to dark: dots stay visible.",
  },
  {
    id: 'ov-stories',
    label: 'Stories: Up next, Done, Skipped',
    group: G,
    screen: 'room',
    fixture: 'revealed-close',
    as: 'hana',
    frame: 'phone',
    overlay: 'stories',
    setup: (s) => {
      s.model.accept(); // PROJ-101 → 8, starts PROJ-102
      s.model.skip(); // PROJ-102 skipped
      s.model.dismissNotice();
    },
    note: 'Tap an Up next row to start it. Done ⋮ → Change value. Skipped → Bring back.',
  },
  {
    id: 'ov-add-stories',
    label: 'Add stories: paste box with preview',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'phone',
    overlay: 'add-stories',
    setup: (s) =>
      s.setEntry({
        addStoriesDraft:
          'PROJ-201 Audit log for admin actions\nPROJ-202 Invite by email\n- Fix the flaky export test',
      }),
    note: 'Three lines → three stories. Add → one "Undo paste" toast for the batch.',
  },
  {
    id: 'ov-room-settings',
    label: 'Room settings (host)',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'phone',
    overlay: 'room-settings',
    note: 'More… shows "Team hours", the custom scale, by name. Password state reads from the relay.',
  },
  {
    id: 'ov-room-settings-voter',
    label: 'Room settings as a voter: read-only',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'ana',
    frame: 'phone',
    overlay: 'room-settings',
    note: 'Ana has no Room settings row in ⋯; opened anyway, it is a read-only summary.',
  },
  {
    id: 'ov-profile',
    label: 'Profile sheet (in session)',
    group: G,
    screen: 'room',
    fixture: 'voting-partial',
    as: 'ana',
    frame: 'phone',
    overlay: 'profile',
  },
  {
    id: 'ov-keys-desktop',
    label: 'Keys dialog (desktop, from the registry)',
    group: G,
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    frame: 'desktop',
    overlay: 'keys',
  },
  {
    id: 'ov-confirm-end',
    label: 'Confirm: End for everyone',
    group: G,
    screen: 'room',
    fixture: 'revealed-close',
    as: 'hana',
    frame: 'phone',
    overlay: 'confirm-end',
  },
  {
    id: 'ov-confirm-remove',
    label: 'Confirm: Remove Sam',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'desktop',
    overlay: 'confirm-remove',
    overlayArg: 'sam',
  },
  {
    id: 'ov-confirm-leave-host',
    label: 'Confirm: Make Ana host and leave',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'phone',
    overlay: 'confirm-leave-host',
  },
  {
    id: 'ov-toast-handoff',
    label: 'Toast: "Hana made Ana the host"',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'phone',
    setup: (s) => {
      s.model.makeHost('ana');
      holdToast(s);
    },
    note: 'A deliberate hand-off reads as one. Compare "Trust: host drops" for the election notice.',
  },
  {
    id: 'ov-toast-skip',
    label: 'Toast: Skipped PROJ-101 · Undo',
    group: G,
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    frame: 'phone',
    setup: (s) => {
      s.model.skip();
      holdToast(s);
    },
    note: 'Skip story has Undo, not a confirm. Press Undo: the round comes back with the votes.',
  },
  {
    id: 'ov-step-out',
    label: 'Step out (‹): Home with the session kept',
    group: G,
    screen: 'home',
    fixture: 'voting-partial',
    as: 'hana',
    frame: 'phone',
    setup: (s) => s.model.stepOut(),
    note: 'Nobody else is affected. Return goes back in without a teardown.',
  },
  {
    id: 'ov-leave-first',
    label: 'Confirm on Home: Leave Sprint 42 first?',
    group: G,
    screen: 'home',
    fixture: 'voting-partial',
    as: 'ana',
    frame: 'phone',
    overlay: 'confirm-leave-first',
    overlayArg: 'start',
    setup: (s) => s.model.stepOut(),
  },
  {
    id: 'ov-header-small',
    label: 'Header at 320: 2 dots + count, no share glyph',
    group: G,
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    frame: 'small-phone',
  },
  {
    id: 'ov-rail-pass',
    label: 'Desktop rail during reveal: votes sorted, "Pass"',
    group: G,
    screen: 'room',
    fixture: 'revealed-one',
    as: 'hana',
    frame: 'desktop',
  },
  {
    id: 'ov-rail-desktop',
    label: 'Desktop rail: People, Up next, Done',
    group: G,
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'desktop',
    setup: (s) => {
      s.model.skip('PROJ-104');
      s.model.dismissNotice();
    },
    note: 'Flat headed lists, no cards. Click an Up next row to start it.',
  },
];
