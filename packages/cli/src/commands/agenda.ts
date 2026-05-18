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
  joinDoc,
  projectDoc,
  appendAgendaItem,
  setAgendaItemState,
  reorderAgendaItem,
  type AgendaItem,
} from '@hnch/shared';
import { loadConfig } from '../config.js';
import { readLastSession } from '../last-session.js';
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
  });

  awareness.setLocalStateField('participantId', opts.participantId);

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
  const cache = readLastSession();
  if (!cache) {
    console.error('No active session. Join a room first with: hnch join <code>');
    process.exit(1);
  }
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
    const id = appendAgendaItem(doc, {
      ...(argv.title?.trim() ? { title: argv.title.trim() } : {}),
      ...(argv.ticket?.trim() ? { ticketId: argv.ticket.trim() } : {}),
      ...(argv.description?.trim() ? { description: argv.description.trim() } : {}),
      createdAt: Date.now(),
    });
    // Allow write to propagate
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    console.log(`Added agenda item: ${id}`);
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
    setAgendaItemState(doc, argv.id, 'skipped', { timestamp: Date.now() });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    console.log(`Skipped agenda item: ${argv.id}`);
  } catch (err) {
    console.error(`Skip failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
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
    setAgendaItemState(doc, argv.id, 'cancelled', { timestamp: Date.now() });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    console.log(`Cancelled agenda item: ${argv.id}`);
  } catch (err) {
    console.error(`Cancel failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
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
    reorderAgendaItem(doc, argv.id, argv.before, argv.after);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    console.log(`Reordered agenda item: ${argv.id}`);
  } catch (err) {
    console.error(`Move failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    disconnect();
  }
}
