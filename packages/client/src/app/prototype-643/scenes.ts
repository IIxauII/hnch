/**
 * PROTOTYPE (#643). Scenes: one named state of the prototype each. The floating
 * bar cycles through them with ← / →; `?scene=<id>` makes each one shareable.
 *
 * Core scenes live here. Area owners add theirs in their own file
 * (entry/entry.scenes.ts, room/chrome.scenes.ts, room/stage.scenes.ts), which
 * this file concatenates. Keep ids unique and kebab-case.
 */
import type { Frame, Overlay, ProtoStore, Screen } from './proto-store';
import type { FixtureName } from './room-model';
import { CHROME_SCENES } from './room/chrome.scenes';
import { STAGE_SCENES } from './room/stage.scenes';
import { ENTRY_SCENES } from './entry/entry.scenes';

export interface Scene {
  id: string;
  label: string;
  /** Group heading in the lab panel's scene list. */
  group:
    | 'Room · host'
    | 'Room · voter'
    | 'Room · viewer'
    | 'Room · overlays'
    | 'Room · trust lab'
    | 'Entry'
    | 'System'
    | string;
  screen: Screen;
  fixture?: FixtureName;
  /** Whose eyes: hana (host), ana (voter), eve (viewer), kai (late joiner). */
  as?: string;
  frame?: Frame;
  overlay?: Overlay;
  overlayArg?: string;
  /** Extra setup after the fixture loaded (e.g. set entry knobs, run a simulation). */
  setup?: (store: ProtoStore) => void;
  /** One line shown under the switcher: what to look at or try here. */
  note?: string;
}

const CORE_SCENES: Scene[] = [
  {
    id: 'host-alone',
    label: 'Host, alone: invite is the empty state',
    group: 'Room · host',
    screen: 'room',
    fixture: 'host-alone',
    as: 'hana',
  },
  {
    id: 'host-waiting',
    label: 'Host, waiting: Start · PROJ-101',
    group: 'Room · host',
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    note: 'One tap starts the next story. No modal, no route change.',
  },
  {
    id: 'host-waiting-empty',
    label: 'Host, waiting, no queue: story field',
    group: 'Room · host',
    screen: 'room',
    fixture: 'waiting-empty-queue',
    as: 'hana',
  },
  {
    id: 'host-voting',
    label: 'Host, voting: Reveal · 3/5',
    group: 'Room · host',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
  },
  {
    id: 'host-settle',
    label: 'Settle window: "Everyone\'s in…"',
    group: 'Room · host',
    screen: 'room',
    fixture: 'voting-all-in',
    as: 'hana',
    note: 'Change your vote now: the window restarts (UX-014).',
  },
  {
    id: 'host-close',
    label: 'Revealed: Close · Accept 8 · Next',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-close',
    as: 'hana',
  },
  {
    id: 'host-split',
    label: 'Revealed: Split · Re-vote',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-split',
    as: 'hana',
    note: 'Tap a column to accept a value instead.',
  },
  {
    id: 'host-agreed',
    label: "Revealed: Agreed · hnch'd",
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-agreed',
    as: 'hana',
  },
  {
    id: 'host-one',
    label: 'Revealed: 1 vote',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-one',
    as: 'hana',
  },
  {
    id: 'host-none',
    label: 'Revealed: No votes',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-none',
    as: 'hana',
  },
  {
    id: 'host-revote',
    label: 'Re-vote: previous tally hollow',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revote',
    as: 'hana',
  },
  {
    id: 'host-done',
    label: 'Queue done: totals + Start a story',
    group: 'Room · host',
    screen: 'room',
    fixture: 'queue-done',
    as: 'hana',
  },
  {
    id: 'host-desktop-voting',
    label: 'Desktop: stage + rail, keys',
    group: 'Room · host',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    frame: 'desktop',
    note: 'Type a face to vote (8, or 1 3 for 13). ⏎ = the primary.',
  },
  {
    id: 'host-desktop-close',
    label: 'Desktop: revealed, rail sorted by value',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-close',
    as: 'hana',
    frame: 'desktop',
  },
  {
    id: 'voter-waiting',
    label: 'Voter, waiting for Hana',
    group: 'Room · voter',
    screen: 'room',
    fixture: 'waiting',
    as: 'ana',
  },
  {
    id: 'voter-fresh',
    label: 'Voter, round just opened',
    group: 'Room · voter',
    screen: 'room',
    fixture: 'voting-fresh',
    as: 'ana',
  },
  {
    id: 'voter-voted',
    label: 'Voter, voted · waiting on Sam, Bob',
    group: 'Room · voter',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'dev',
  },
  {
    id: 'voter-close',
    label: 'Voter, revealed: waiting for Hana',
    group: 'Room · voter',
    screen: 'room',
    fixture: 'revealed-close',
    as: 'ana',
  },
  {
    id: 'voter-late',
    label: 'Late joiner Kai: counted once they vote',
    group: 'Room · voter',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'kai',
  },
  {
    id: 'viewer-voting',
    label: "Viewer: You're watching",
    group: 'Room · viewer',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'eve',
  },
  {
    id: 'small-phone-close',
    label: 'Phone SE 320: revealed',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-close',
    as: 'hana',
    frame: 'small-phone',
  },
  {
    id: 'tablet-voting',
    label: 'Tablet: single column, side sheets',
    group: 'Room · host',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    frame: 'tablet',
  },
  {
    id: 'wide-close',
    label: 'Wide 1680: shared-screen sizes',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-close',
    as: 'hana',
    frame: 'wide',
  },
  // trust lab: each scene arms a simulation; press the lab buttons to replay it
  {
    id: 'trust-reload',
    label: 'Trust: a voted peer reloads (UX-001)',
    group: 'Room · trust lab',
    screen: 'room',
    fixture: 'voting-all-in',
    as: 'hana',
    setup: (s) => s.model.simulateReload('sam'),
    note: 'Sam reloads with everyone in: the round stays hidden until Sam is synced.',
  },
  {
    id: 'trust-double-start',
    label: 'Trust: second Start mid-vote refused (UX-003)',
    group: 'Room · trust lab',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    setup: (s) => s.model.simulateDoubleStart(),
  },
  {
    id: 'trust-host-offline',
    label: 'Trust: host drops, election skips offline peers',
    group: 'Room · trust lab',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'ana',
    setup: (s) => s.model.simulateHostOffline(),
  },
  {
    id: 'trust-self-offline',
    label: 'Trust: you lose the connection',
    group: 'Room · trust lab',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    setup: (s) => s.model.simulateSelfOffline(),
  },
  {
    id: 'trust-peer-back',
    label: 'Trust: a peer presses Back mid-round (UX-002)',
    group: 'Room · trust lab',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'hana',
    setup: (s) => s.model.simulatePeerBack('sam'),
  },
  {
    id: 'trust-kicked',
    label: 'Removed: terminal state in place',
    group: 'Room · trust lab',
    screen: 'room',
    fixture: 'voting-partial',
    as: 'ana',
    setup: (s) => s.model.simulateKick('ana'),
  },
];

export const SCENES: Scene[] = [...ENTRY_SCENES, ...CORE_SCENES, ...STAGE_SCENES, ...CHROME_SCENES];

export function applyScene(store: ProtoStore, scene: Scene) {
  store.screen.set(scene.screen);
  if (scene.frame) store.frame.set(scene.frame);
  store.load(scene.fixture ?? 'waiting', scene.as ?? 'hana');
  if (scene.as === 'kai') store.model.viewAs('kai');
  if (scene.overlay) store.open(scene.overlay, scene.overlayArg ?? null);
  scene.setup?.(store);
}
