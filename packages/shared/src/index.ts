export * from './abstain.js';
export * from './auth.js';
export * from './auto-reveal.js';
export * from './avatar-palette.js';
export * from './doc.js';
// doc-projection is re-exported by name (not `export *`) so the raw writers
// stay internal to the package, each behind the one seam consumers see:
//   - `revealRound` / `skipRound` / `discardRound` → `round-commands` (#472)
//   - `castVote` / `clearVote`                     → `vote-commands`  (#504)
// In both cases the command module is the sole caller and the only surface
// consumers get. The writers remain `export`ed from doc-projection so those
// command modules and the colocated writer tests can import them by path.
export {
  activeRound,
  agendaArray,
  appendAgendaItem,
  appendRound,
  consumeAgendaItem,
  currentRound,
  DOC_AGENDA_KEY,
  DOC_META_KEY,
  DOC_PARTICIPANTS_KEY,
  DOC_ROUNDS_KEY,
  DOC_SETTINGS_KEY,
  endSessionForEveryone,
  initDoc,
  isConsensus,
  joinDoc,
  leaveSession,
  nextPendingAgendaItem,
  patchRoundDescriptor,
  patchSettings,
  projectDoc,
  removeParticipant,
  reorderAgendaItem,
  setAgendaItemState,
  setAvatarColor,
  updateAgendaItemFields,
  upsertParticipant,
  type AppendAgendaItemInit,
  type AppendRoundInit,
  type DocProjection,
  type InitDocInit,
  type JoinDocInit,
  type ParticipantSnapshot,
  type PatchRoundDescriptorInit,
  type SetAgendaItemStateOpts,
  type UpdateAgendaItemFieldsInit,
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
export * from './round-commands.js';
export * from './round-export.js';
export * from './round-stats.js';
export * from './round-transitions.js';
export * from './scales.js';
export * from './vote-commands.js';
