/** PROTOTYPE (#643). Extra scenes owned by the stage area. */
import type { Scene } from '../scenes';

export const STAGE_SCENES: Scene[] = [
  {
    id: 'stage-after-accept',
    label: 'Accept · Next: "Previous: PROJ-101 → 8"',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-close',
    as: 'hana',
    setup: (s) => s.model.accept(),
    note: 'One tap accepted 8 and opened PROJ-102 in place. The meta row and the toast show the recorded value.',
  },
  {
    id: 'stage-host-pick',
    label: 'Split, host picked 8: Accept 8 · Next',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-split',
    as: 'hana',
    setup: (s) => s.model.pick('8'),
    note: 'Tapping a Strip column turned Re-vote into Accept 8 · Next. "Use …" or another column changes it.',
  },
  {
    id: 'stage-voter-picked',
    label: 'Voter sees "Hana picked 13"',
    group: 'Room · voter',
    screen: 'room',
    fixture: 'revealed-close',
    as: 'ana',
    setup: (s) => {
      s.model.viewAs('hana');
      s.model.pick('13');
      s.model.viewAs('ana');
    },
  },
  {
    id: 'stage-tshirt-desktop',
    label: 'Desktop, T-shirt deck: letter keycaps',
    group: 'Room · host',
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    frame: 'desktop',
    setup: (s) => {
      s.model.setScale('t-shirt');
      s.model.start();
    },
    note: 'Letter decks show a keycap per card: type S, M, L, XS or XL. Numeric decks show one hint row instead.',
  },
  {
    id: 'stage-desktop-typing',
    label: 'Desktop, Fibonacci: type 1 then 3 for 13',
    group: 'Room · host',
    screen: 'room',
    fixture: 'voting-fresh',
    as: 'hana',
    frame: 'desktop',
    note: 'Type 8 (votes 8), 1 3 (votes 13), or 2 (waits 450 ms because 21 exists: the tile shows "typing…"). - passes, ⌫ clears, ⏎ reveals.',
  },
  {
    id: 'stage-linear-phone',
    label: 'Phone, Linear 1–10: 5 columns, square tiles',
    group: 'Room · voter',
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    setup: (s) => {
      s.model.setScale('linear');
      s.model.viewAs('ana');
      s.model.start(undefined, 'hana');
    },
  },
  {
    id: 'stage-risk-phone',
    label: 'Phone, Risk deck: one face size per deck',
    group: 'Room · voter',
    screen: 'room',
    fixture: 'waiting',
    as: 'hana',
    setup: (s) => {
      s.model.setScale('risk');
      s.model.viewAs('ana');
      s.model.start(undefined, 'hana');
    },
    note: '"Low" and "Medium" share one size, picked by the longest face.',
  },
  {
    id: 'stage-dark-agreed',
    label: "Desktop dark: Agreed · hnch'd",
    group: 'Room · host',
    screen: 'room',
    fixture: 'revealed-agreed',
    as: 'hana',
    frame: 'desktop',
    setup: (s) => s.theme.set('dark'),
    note: 'Sets the theme to dark; switch it back in the lab. The burst never blocks Accept; reduced motion keeps only the stamp.',
  },
  {
    id: 'stage-revote-revealed',
    label: 'Re-vote revealed: hollow dots = last time',
    group: 'Room · host',
    screen: 'room',
    fixture: 'revote',
    as: 'hana',
    setup: (s) => {
      s.model.peerVotes('bob', '8');
      s.model.peerVotes('dev', '13');
      s.model.vote('8');
      s.model.reveal();
    },
  },
];
