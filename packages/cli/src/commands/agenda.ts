/**
 * Agenda subcommand handlers — CLI mutations for the pre-session story agenda
 * (ADR-0042).
 *
 * Each handler:
 *  1. Loads config + last session cache.
 *  2. Resolves the room and opens a Yjs connection via wireSession.
 *  3. Waits for the first sync flush.
 *  4. Performs the mutation.
 *  5. Waits briefly for the write to propagate then disconnects.
 */

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  AWARENESS_PARTICIPANT_ID_FIELD,
  addItem,
  cancelItem,
  joinDoc,
  moveItem,
  projectDoc,
  skipItem,
  type AgendaItem,
  type AgendaResult,
} from '@hnch/shared';
import { loadConfig } from '../config.js';
import { readEntries } from '../last-session.js';
import { resolveRoom } from '../relay-api.js';
import { wireSession } from '../session.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** State markers for agenda list display. */
const STATE_MARKER: Record<string, string> = {
  pending: '•',
  consumed: '✓',
  skipped: '~',
  cancelled: '✗',
};

export function agendaItemLabel(item: AgendaItem): string {
  const marker = STATE_MARKER[item.state] ?? '?';
  const parts: string[] = [];
  if (item.ticketId) parts.push(`[${item.ticketId}]`);
  if (item.title) parts.push(item.title);
  const label = parts.join(' ') || item.id;
  return `${marker} ${label}`;
}

/**
 * Human copy for an agenda command's refusal. The commands return a reason
 * rather than throwing (#507), so the one-shot subcommands print the same
 * sentence for the same cause instead of surfacing a writer's error string.
 */
function agendaRefusal(reason: Extract<AgendaResult, { applied: false }>['reason']): string {
  switch (reason) {
    case 'not-found':
      return 'no agenda item with that id';
    case 'not-pending':
      return 'the item is no longer pending — a peer may have skipped, cancelled or estimated it';
    case 'invalid-fields':
      // Rarely reached: `handleAgendaAdd` rejects a blank title+ticket up front
      // so it never opens a relay connection just to be refused. The arm stays
      // because the union is one per module, not one per command, and an
      // exhaustive switch is what keeps a future reason from silently
      // returning undefined here.
      return 'an agenda item needs at least one of --title or --ticket';
  }
}

interface AgendaConnectionOpts {
  relayUrl: string;
  participantId: string;
  displayName: string;
  roomCode: string;
  roomUuid: string;
  passwordHash?: string;
}

async function openAgendaConnection(
  opts: AgendaConnectionOpts,
): Promise<{ doc: Y.Doc; disconnect: () => void }> {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);

  joinDoc(doc, {
    participantId: opts.participantId,
    displayName: opts.displayName,
    joinedAt: Date.now(),
  });

  awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, opts.participantId);

  const session = wireSession({
    doc,
    awareness,
    roomCode: opts.roomCode,
    roomUuid: opts.roomUuid,
    participantId: opts.participantId,
    relayUrl: opts.relayUrl,
    ...(opts.passwordHash !== undefined && { passwordHash: opts.passwordHash }),
  });

  // Wait for initial sync (best-effort — relay sends state vector within ~1s)
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    const unsub = session.onStatusChange((status) => {
      if (status === 'connected') {
        // Give Yjs a moment to flush the initial state update
        setTimeout(() => {
          clearTimeout(timeout);
          unsub();
          resolve();
        }, 200);
      }
    });
  });

  return { doc, disconnect: () => session.disconnect() };
}

async function resolveLastSessionOrDie(): Promise<{
  roomCode: string;
  roomUuid: string;
  passwordHash?: string;
}> {
  const entries = readEntries();
  if (entries.length === 0) {
    console.error('No active session. Join a room first with: hnch join <code>');
    process.exit(1);
  }
  // Most-recent entry (already sorted desc by lastSeenAt)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const cache = entries[0]!;
  // exactOptionalPropertyTypes: only include passwordHash when present
  return {
    roomCode: cache.roomCode,
    roomUuid: cache.roomUuid,
    ...(cache.passwordHash !== undefined && { passwordHash: cache.passwordHash }),
  };
}

// ---------------------------------------------------------------------------
// Public handler functions
// ---------------------------------------------------------------------------

export async function handleAgendaAdd(argv: {
  title?: string;
  ticket?: string;
  description?: string;
}): Promise<void> {
  if (!argv.title?.trim() && !argv.ticket?.trim()) {
    console.error('At least one of --title or --ticket is required');
    process.exit(1);
  }

  const config = await loadConfig();
  const cached = await resolveLastSessionOrDie();

  try {
    await resolveRoom(config.relayUrl, cached.roomCode);
  } catch {
    console.error(`Room ${cached.roomCode} not found on relay — session may have expired.`);
    process.exit(1);
  }

  const { doc, disconnect } = await openAgendaConnection({
    relayUrl: config.relayUrl,
    participantId: config.participantId,
    displayName: config.displayName,
    roomCode: cached.roomCode,
    roomUuid: cached.roomUuid,
    ...(cached.passwordHash !== undefined && { passwordHash: cached.passwordHash }),
  });

  try {
    // The command stamps `createdAt` — no hand-rolled clock at the call site.
    const result = addItem(doc, {
      ...(argv.title?.trim() ? { title: argv.title.trim() } : {}),
      ...(argv.ticket?.trim() ? { ticketId: argv.ticket.trim() } : {}),
      ...(argv.description?.trim() ? { description: argv.description.trim() } : {}),
    });
    if (!result.applied) {
      console.error(`Add failed: ${agendaRefusal(result.reason)}`);
      process.exit(1);
    }
    // Allow write to propagate
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    console.log(`Added agenda item: ${result.id}`);
  } finally {
    disconnect();
  }
}

export async function handleAgendaList(): Promise<void> {
  const config = await loadConfig();
  const cached = await resolveLastSessionOrDie();

  try {
    await resolveRoom(config.relayUrl, cached.roomCode);
  } catch {
    console.error(`Room ${cached.roomCode} not found on relay — session may have expired.`);
    process.exit(1);
  }

  const { doc, disconnect } = await openAgendaConnection({
    relayUrl: config.relayUrl,
    participantId: config.participantId,
    displayName: config.displayName,
    roomCode: cached.roomCode,
    roomUuid: cached.roomUuid,
    ...(cached.passwordHash !== undefined && { passwordHash: cached.passwordHash }),
  });

  try {
    const projection = projectDoc(doc);
    const items = projection.agenda;
    if (items.length === 0) {
      console.log('No agenda items.');
      return;
    }
    items.forEach((item, idx) => {
      console.log(`${String(idx + 1).padStart(2)}. ${agendaItemLabel(item)}`);
    });
  } finally {
    disconnect();
  }
}

export async function handleAgendaSkip(argv: { id: string }): Promise<void> {
  const config = await loadConfig();
  const cached = await resolveLastSessionOrDie();

  try {
    await resolveRoom(config.relayUrl, cached.roomCode);
  } catch {
    console.error(`Room ${cached.roomCode} not found on relay — session may have expired.`);
    process.exit(1);
  }

  const { doc, disconnect } = await openAgendaConnection({
    relayUrl: config.relayUrl,
    participantId: config.participantId,
    displayName: config.displayName,
    roomCode: cached.roomCode,
    roomUuid: cached.roomUuid,
    ...(cached.passwordHash !== undefined && { passwordHash: cached.passwordHash }),
  });

  try {
    const result = skipItem(doc, argv.id);
    if (!result.applied) {
      console.error(`Skip failed: ${agendaRefusal(result.reason)}`);
      process.exit(1);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    console.log(`Skipped agenda item: ${argv.id}`);
  } finally {
    disconnect();
  }
}

export async function handleAgendaCancel(argv: { id: string }): Promise<void> {
  const config = await loadConfig();
  const cached = await resolveLastSessionOrDie();

  try {
    await resolveRoom(config.relayUrl, cached.roomCode);
  } catch {
    console.error(`Room ${cached.roomCode} not found on relay — session may have expired.`);
    process.exit(1);
  }

  const { doc, disconnect } = await openAgendaConnection({
    relayUrl: config.relayUrl,
    participantId: config.participantId,
    displayName: config.displayName,
    roomCode: cached.roomCode,
    roomUuid: cached.roomUuid,
    ...(cached.passwordHash !== undefined && { passwordHash: cached.passwordHash }),
  });

  try {
    const result = cancelItem(doc, argv.id);
    if (!result.applied) {
      console.error(`Cancel failed: ${agendaRefusal(result.reason)}`);
      process.exit(1);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    console.log(`Cancelled agenda item: ${argv.id}`);
  } finally {
    disconnect();
  }
}

export async function handleAgendaMv(argv: {
  id: string;
  before?: string;
  after?: string;
}): Promise<void> {
  const config = await loadConfig();
  const cached = await resolveLastSessionOrDie();

  try {
    await resolveRoom(config.relayUrl, cached.roomCode);
  } catch {
    console.error(`Room ${cached.roomCode} not found on relay — session may have expired.`);
    process.exit(1);
  }

  const { doc, disconnect } = await openAgendaConnection({
    relayUrl: config.relayUrl,
    participantId: config.participantId,
    displayName: config.displayName,
    roomCode: cached.roomCode,
    roomUuid: cached.roomUuid,
    ...(cached.passwordHash !== undefined && { passwordHash: cached.passwordHash }),
  });

  try {
    const result = moveItem(doc, argv.id, argv.before, argv.after);
    if (!result.applied) {
      console.error(`Move failed: ${agendaRefusal(result.reason)}`);
      process.exit(1);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    console.log(`Reordered agenda item: ${argv.id}`);
  } finally {
    disconnect();
  }
}
