export * from './abstain.js';
export * from './agenda-commands.js';
export * from './auth.js';
export * from './auto-reveal.js';
export * from './avatar-palette.js';
export * from './doc.js';
// doc-projection is re-exported by name (not `export *`) so the raw writers
// stay internal to the package, each behind the one seam consumers see:
//   - `revealRound` / `skipRound` / `discardRound`  → `round-commands`  (#472)
//   - `castVote` / `clearVote`                      → `vote-commands`   (#504)
//   - `appendAgendaItem` / `updateAgendaItemFields`
//     / `setAgendaItemState` / `reorderAgendaItem`  → `agenda-commands` (#507)
//   - `upsertParticipant` / `setAvatarColor`
//     / `leaveSession` / `removeParticipant`
//     / `endSessionForEveryone`                     → `roster-commands` (#507)
// In every case the command module is the sole caller and the only surface
// consumers get. The writers remain `export`ed from doc-projection so those
// command modules and the colocated writer tests can import them by path.
//
// `patchSettings` is public but *narrowed*: its `PublicSettingsPatch`
// parameter type excludes `hostParticipantId`, so a host change can only be
// expressed through `roster-commands`. The full-width writer
// (`patchSettingsInternal`) is package-internal.
//
// `joinDoc` stays raw and public: it runs before a roster exists, and its
// callers each pass different initialisation — there is no rule to
// concentrate.
export {
  activeRound,
  agendaArray,
  appendRound,
  currentRound,
  DOC_AGENDA_KEY,
  DOC_META_KEY,
  DOC_PARTICIPANTS_KEY,
  DOC_ROUNDS_KEY,
  DOC_SETTINGS_KEY,
  initDoc,
  isConsensus,
  joinDoc,
  nextPendingAgendaItem,
  patchRoundDescriptor,
  patchSettings,
  projectDoc,
  type AppendRoundInit,
  type DocProjection,
  type InitDocInit,
  type JoinDocInit,
  type ParticipantSnapshot,
  type PatchRoundDescriptorInit,
  type PublicSettingsPatch,
} from './doc-projection.js';
export * from './election.js';
export * from './format-round-label.js';
export * from './fractional-index.js';
export * from './format-time.js';
export * from './health.js';
export * from './is-likely-url.js';
export * from './last-session.js';
export * from './lineage.js';
export * from './password.js';
export * from './room-code.js';
export * from './roster-commands.js';
export * from './round-commands.js';
export * from './round-export.js';
export * from './round-stats.js';
export * from './round-transitions.js';
export * from './scales.js';
export * from './screen-for.js';
export * from './vote-commands.js';
