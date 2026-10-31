/**
 * PROTOTYPE (#643). TUI-local state: the mode stack (UX-098), the card-key
 * resolver's pending prefix, the deck cursor, local flashes. Room state lives
 * in the RoomModel; this is only what one terminal is looking at.
 */
import { SCALES, type RoomModel } from '../room-model.js';

export type Mode =
  | { kind: 'help'; scroll: number }
  | { kind: 'invite' }
  | { kind: 'add'; text: string }
  | { kind: 'people'; cursor: number }
  | { kind: 'stories'; cursor: number }
  | { kind: 'menu'; cursor: number }
  | { kind: 'confirm'; action: 'end' | 'remove' | 'leave-host'; arg?: string; cursor: 0 | 1 }
  | { kind: 'settings'; cursor: number; scaleIdx: number }
  | { kind: 'password'; value: string }
  | { kind: 'name'; value: string }
  | { kind: 'export' }
  | { kind: 'lab'; cursor: number };

export interface Flash {
  text: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  until: number;
}

export interface Ui {
  stack: Mode[];
  /** card-key resolver state (R-17) */
  pending: string;
  absorb: string;
  /** arrow cursor on the deck (index into cards, cards.length = Pass); null until an arrow is used */
  cursor: number | null;
  flash?: Flash | undefined;
  /** R-48: a base-level Esc within 400 ms of a layer closing is ignored */
  lastPopAt: number;
  /** UX-012: simulated 600 ms connect, then `● live` (also in password rooms) */
  connecting: boolean;
  /** lab line: which event is on screen and until when */
  labAt: number;
  labUntil: number;
}

export function initialUi(model: RoomModel): Ui {
  return {
    stack: [],
    pending: '',
    absorb: '',
    cursor: null,
    lastPopAt: 0,
    connecting: true,
    labAt: model.state.lab[0]?.at ?? 0,
    labUntil: 0,
  };
}

export function top(ui: Ui): Mode | undefined {
  return ui.stack[ui.stack.length - 1];
}

// ── menu (m outside voting, esc while voting) ─────────────────────────────

export type MenuId =
  | 'skip'
  | 'revote'
  | 'invite'
  | 'people'
  | 'stories'
  | 'add'
  | 'watch'
  | 'export'
  | 'settings'
  | 'help'
  | 'leave'
  | 'end';

export interface MenuItem {
  id: MenuId;
  label: string;
  key: string;
  tone?: 'danger';
}

/**
 * One menu with every less-frequent action (UX-084: never a single-item host
 * menu). Export only when a revealed round exists (UX-106). No config editors
 * here: scales, avatar and defaults live in `hnch config` (UX-083).
 */
export function menuItems(m: RoomModel): MenuItem[] {
  const ph = m.phase;
  const host = m.isHost;
  const items: MenuItem[] = [];
  if (host && ph !== 'waiting')
    items.push({ id: 'skip', label: 'Skip story (undo 5 s)', key: 's' });
  if (host && ph === 'revealed') items.push({ id: 'revote', label: 'Re-vote', key: 'r' });
  items.push({ id: 'invite', label: 'Invite', key: 'i' });
  items.push({ id: 'people', label: 'People', key: 'p' });
  items.push({ id: 'stories', label: 'Stories', key: 't' });
  if (ph !== 'voting') items.push({ id: 'add', label: 'Add stories (paste many)', key: '+' });
  items.push({
    id: 'watch',
    label: m.self?.role === 'viewer' ? 'Vote instead' : 'Just watching',
    key: 'w',
  });
  if (m.history.length > 0) items.push({ id: 'export', label: 'Export results', key: 'x' });
  items.push({ id: 'settings', label: host ? 'Room settings' : 'Settings', key: 'e' });
  items.push({ id: 'help', label: 'Keys and help', key: '?' });
  items.push({ id: 'leave', label: `Leave ${m.state.name}`, key: 'l' });
  if (host) items.push({ id: 'end', label: 'End for everyone…', key: '', tone: 'danger' });
  return items;
}

// ── room settings (host: scale + password; everyone: your name) ─────────────

export type SettingId = 'scale' | 'password' | 'name';
export function settingItems(m: RoomModel): SettingId[] {
  return m.isHost ? ['scale', 'password', 'name'] : ['name'];
}
export const SCALE_IDS = Object.keys(SCALES);

// ── trust lab (ctrl+l) ─────────────────────────────────────────────────────

export interface LabItem {
  id: string;
  label: string;
  ux: string;
}
export const LAB_ITEMS: LabItem[] = [
  { id: 'everyone', label: 'Everyone votes now', ux: 'UX-001 UX-014' },
  { id: 'reload', label: 'Sam reloads after voting', ux: 'UX-001' },
  { id: 'host-drop', label: 'Host drops', ux: 'UX-078' },
  { id: 'self-offline', label: 'You go offline', ux: 'UX-012' },
  { id: 'double-start', label: 'A second Start (stale tab)', ux: 'UX-003' },
  { id: 'kick', label: 'Hana removes you', ux: 'UX-010' },
  { id: 'peer-back', label: 'Ana presses Back', ux: 'UX-002' },
  { id: 'peer-stories', label: 'Ana adds 3 stories (agenda observed live)', ux: 'UX-011' },
  { id: 'auto', label: 'Peers vote on their own: on/off', ux: '' },
];

/** Stories overlay rows: Up next, then Done, then Skipped. */
export function storyRows(m: RoomModel) {
  const cur = m.currentStory;
  return [
    ...(cur ? [{ story: cur, section: 'Now' as const }] : []),
    ...m.queue.map((story) => ({ story, section: 'Up next' as const })),
    ...m.done.map((story) => ({ story, section: 'Done' as const })),
    ...m.skipped.map((story) => ({ story, section: 'Skipped' as const })),
  ];
}

/** People overlay rows: present people, host first. */
export function peopleRows(m: RoomModel) {
  return m.present.toSorted(
    (a, b) => Number(b.id === m.state.hostId) - Number(a.id === m.state.hostId),
  );
}
