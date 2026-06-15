export * from './abstain.js';
export * from './auth.js';
export * from './auto-reveal.js';
export * from './avatar-palette.js';
export * from './doc.js';
// doc-projection is re-exported by name (not `export *`) so the raw terminal
// writers `revealRound` / `skipRound` / `discardRound` stay internal to the
// package: `round-commands` is their sole caller and the single terminal seam
// consumers see (#472 Phase 3). They remain `export`ed from doc-projection so
// round-commands and the colocated writer tests can import them by path.
export {
  agendaArray,
  appendAgendaItem,
  appendRound,
  castVote,
  clearVote,
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
