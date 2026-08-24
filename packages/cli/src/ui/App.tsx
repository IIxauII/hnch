import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { SessionHandle } from '../session.js';
import type { SyncStatus } from '../sync.js';
import type {
  DocProjection,
  Round,
  Scale,
  PresetOverrides,
  CustomScale,
  RosterResult,
} from '@hnch/shared';
import {
  addItem as addAgendaItem,
  canEnterTerminal,
  currentRound,
  isTerminalStatus,
  nextPendingAgendaItem,
  participantRole,
  screenFor,
} from '@hnch/shared';
import clipboard from 'clipboardy';
import { shareCode, shareUrl, shareNpxCommand } from '../share.js';
import {
  buildNewRoundArgs,
  buildRoundPreFill,
  normalizeRoundPromptValue,
} from './round-prompt-flow.js';
import { StatusBar } from './components/StatusBar.js';
import { LobbySettings } from './components/LobbySettings.js';
import { Lobby } from './Lobby.js';
import { exportResultsToClipboard } from './lobby-helpers.js';
import { Voting } from './Voting.js';
import { useTransientNotice } from './hooks/useTransientNotice.js';

/**
 * Human copy for a roster refusal the handoff affordance can hit. The union
 * is one per module rather than one per command, so `'self-target'` — a
 * `kick`-only reason — appears here too; it gets a sentence describing *this*
 * act rather than a cast, but `handoffHost` never returns it.
 */
const HANDOFF_REFUSAL: Record<Extract<RosterResult, { applied: false }>['reason'], string> = {
  'not-host': 'only the current host can hand off',
  'not-found': 'that participant is not in the session',
  'not-online': 'that participant is offline',
  'self-target': 'you cannot hand off to yourself',
};

interface Props {
  session: SessionHandle;
  participantId: string;
  displayName: string;
  accessMode: 'open' | 'password' | 'invite';
  presetOverrides?: PresetOverrides | undefined;
  customScales?: CustomScale[] | undefined;
}

export function App({
  session,
  participantId,
  displayName,
  accessMode: initialAccessMode,
  presetOverrides,
  customScales,
}: Props): React.ReactElement {
  const { exit } = useApp();
  const [projection, setProjection] = useState<DocProjection>(session.projection());
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [onlineIds, setOnlineIds] = useState<Set<string>>(session.onlineIds());
  const [elapsedMs, setElapsedMs] = useState<number | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accessMode, setAccessMode] = useState<'open' | 'password'>(
    initialAccessMode === 'password' ? 'password' : 'open',
  );
  const [displayNameLocal, setDisplayNameLocal] = useState(displayName);
  const [confirmingQuit, setConfirmingQuit] = useState(false);
  const [roundTitlePromptActive, setRoundTitlePromptActive] = useState(false);
  const [roundTitleInput, setRoundTitleInput] = useState('');
  const [roundTicketIdPromptActive, setRoundTicketIdPromptActive] = useState(false);
  const [roundTicketIdInput, setRoundTicketIdInput] = useState('');
  const [pendingRoundTitle, setPendingRoundTitle] = useState<string | undefined>();
  const [descriptorPromptActive, setDescriptorPromptActive] = useState(false);
  const [descriptorInput, setDescriptorInput] = useState('');
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [agendaAddPromptActive, setAgendaAddPromptActive] = useState(false);
  const [agendaAddTitleInput, setAgendaAddTitleInput] = useState('');
  const [agendaAddTicketIdPromptActive, setAgendaAddTicketIdPromptActive] = useState(false);
  const [agendaAddTicketIdInput, setAgendaAddTicketIdInput] = useState('');
  const [pendingAgendaTitle, setPendingAgendaTitle] = useState<string | undefined>();
  const [pendingAgendaItemId, setPendingAgendaItemId] = useState<string | undefined>();
  const hostNotice = useTransientNotice(3000);
  const [shareOpen, setShareOpen] = useState(false);
  const shareNotice = useTransientNotice(3000);
  const exportNotice = useTransientNotice(3000);
  const agendaNotice = useTransientNotice(3000);

  useEffect(() => {
    const unsub1 = session.onChange(() => {
      setProjection(session.projection());
      setOnlineIds(session.onlineIds());
    });
    const unsub2 = session.onStatusChange(setStatus);
    const unsub3 = session.onHostChange((newHostId) => {
      const proj = session.projection();
      const newHost = proj.participants.find((p) => p.id === newHostId);
      const message =
        newHostId === participantId
          ? 'You are now the host'
          : `${newHost?.displayName || 'Unknown'} is now the host`;
      hostNotice.show(message);
    });

    // Poll awareness for online IDs and update elapsed time each second
    const awarenessInterval = setInterval(() => {
      setOnlineIds(session.onlineIds());
      const proj = session.projection();
      const round = currentRound(proj);
      if (round?.timerStartedAt !== undefined && canEnterTerminal(round.status)) {
        setElapsedMs(Date.now() - round.timerStartedAt);
      } else {
        setElapsedMs(undefined);
      }
    }, 1000);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      clearInterval(awarenessInterval);
    };
  }, [session, participantId, hostNotice.show]);

  // Global quit handler — inactive when settings panel or title prompt is open
  useInput(
    (input) => {
      if (input === 'q' || input === 'Q') {
        setConfirmingQuit(true);
      }
    },
    {
      isActive:
        !settingsOpen &&
        !confirmingQuit &&
        !roundTitlePromptActive &&
        !roundTicketIdPromptActive &&
        !descriptorPromptActive &&
        !shareOpen &&
        !agendaAddPromptActive &&
        !agendaAddTicketIdPromptActive,
    },
  );

  // Confirm quit handler — active only during confirmation
  useInput(
    (input, key) => {
      if (input === 'y' || input === 'Y') {
        session.disconnect();
        exit();
      } else if (input === 'n' || input === 'N' || key.escape) {
        setConfirmingQuit(false);
      }
    },
    { isActive: confirmingQuit },
  );

  // The screen rule is shared with the mobile client (issue #508); the Ink
  // component names below describe views, not screens — `Voting` renders what
  // the shared union calls `estimating`.
  const screen = screenFor(projection);

  const round = currentRound(projection);
  const isHost = projection.settings.hostParticipantId === participantId;
  const myParticipant = projection.participants.find((p) => p.id === participantId);
  const myRole = participantRole(myParticipant ?? {});

  const handleStartRoundPrompt = useCallback(() => {
    // Pre-fill from next pending agenda item (ADR-0042 / issue #153)
    const preFill = buildRoundPreFill(nextPendingAgendaItem(projection));
    setRoundTitleInput(preFill.title);
    setPendingAgendaItemId(preFill.agendaItemId);
    setRoundTitlePromptActive(true);
  }, [projection]);

  const handleRoundTitleSubmit = useCallback(
    (title: string) => {
      setRoundTitlePromptActive(false);
      setRoundTitleInput('');
      setPendingRoundTitle(normalizeRoundPromptValue(title));
      // Preserve pre-filled ticketId from agenda item if available
      const preFill = buildRoundPreFill(nextPendingAgendaItem(projection));
      setRoundTicketIdInput(preFill.ticketId);
      setRoundTicketIdPromptActive(true);
    },
    [projection],
  );

  const handleRoundTitleCancel = useCallback(() => {
    setRoundTitlePromptActive(false);
    setRoundTitleInput('');
    setPendingRoundTitle(undefined);
    setPendingAgendaItemId(undefined);
  }, []);

  const handleRoundTicketIdSubmit = useCallback(
    (ticketId: string) => {
      setRoundTicketIdPromptActive(false);
      setRoundTicketIdInput('');
      const [title, normalizedTicketId, agendaItemId] = buildNewRoundArgs(
        pendingRoundTitle,
        ticketId,
        pendingAgendaItemId,
      );
      session.newRound(title, normalizedTicketId, agendaItemId);
      setPendingRoundTitle(undefined);
      setPendingAgendaItemId(undefined);
    },
    [session, pendingRoundTitle, pendingAgendaItemId],
  );

  const handleRoundTicketIdCancel = useCallback(() => {
    setRoundTicketIdPromptActive(false);
    setRoundTicketIdInput('');
    setPendingRoundTitle(undefined);
    setPendingAgendaItemId(undefined);
  }, []);

  const handleEditDescriptor = useCallback(() => {
    const current = session.current();
    if (!current || current.status !== 'revealed') return;
    setEditingRoundId(current.id);
    setDescriptorInput(current.title ?? '');
    setDescriptorPromptActive(true);
  }, [session]);

  const handleDescriptorSubmit = useCallback(
    (value: string) => {
      const id = editingRoundId;
      setDescriptorPromptActive(false);
      setEditingRoundId(null);
      if (!id) return;
      const trimmed = value.trim();
      if (trimmed === '') return;
      session.updateRoundDescriptor(id, { title: trimmed });
    },
    [session, editingRoundId],
  );

  const handleDescriptorCancel = useCallback(() => {
    setDescriptorPromptActive(false);
    setEditingRoundId(null);
  }, []);

  const handleToggleCurrentVote = useCallback(
    (card: string) => {
      session.toggleCurrentVote(card);
    },
    [session],
  );

  const handleClearCurrentVote = useCallback(() => {
    session.clearCurrentVote();
  }, [session]);

  const handleReveal = useCallback(() => {
    session.reveal();
  }, [session]);

  const handleSkip = useCallback(() => {
    session.skip();
  }, [session]);

  const handleDiscard = useCallback(() => {
    session.discardCurrentRound();
  }, [session]);

  const handleNewRound = useCallback(() => {
    // Pre-fill from next pending agenda item (ADR-0042 / issue #153)
    const preFill = buildRoundPreFill(nextPendingAgendaItem(projection));
    setRoundTitleInput(preFill.title);
    setPendingAgendaItemId(preFill.agendaItemId);
    setRoundTitlePromptActive(true);
  }, [projection]);

  const handleRevote = useCallback(() => {
    session.revote();
  }, [session]);

  const handleToggleRole = useCallback(() => {
    session.toggleRole();
  }, [session]);

  const handleChangeName = useCallback(
    (name: string | undefined) => {
      session.updateName(name);
    },
    [session],
  );

  const handleChangeScale = useCallback(
    (scale: Scale) => {
      session.updateScale(scale);
    },
    [session],
  );

  const handleChangeDisplayName = useCallback(
    (name: string) => {
      session.updateDisplayName(name);
      setDisplayNameLocal(name);
    },
    [session],
  );

  const handleChangeAccess = useCallback(
    async (mode: 'open' | 'password', password?: string) => {
      await session.updateAccess(mode, password);
      setAccessMode(mode);
    },
    [session],
  );

  const handleHandoffHost = useCallback(
    (targetId: string) => {
      // The shared roster command refuses rather than throwing, so the TUI
      // branches on the reason instead of catching to stay alive (#507).
      const result = session.handoffHost(targetId);
      if (!result.applied) {
        console.error(`Handoff failed: ${HANDOFF_REFUSAL[result.reason]}`);
      }
    },
    [session],
  );

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handleEndSession = useCallback(() => {
    session.endSessionForEveryone();
  }, [session]);

  const handleShare = useCallback(
    async (kind: 'code' | 'url' | 'npx') => {
      const text =
        kind === 'code'
          ? shareCode(session.roomCode)
          : kind === 'url'
            ? shareUrl(session.roomCode)
            : shareNpxCommand(session.roomCode);
      try {
        await clipboard.write(text);
        shareNotice.show('Copied!');
      } catch {
        shareNotice.show(`Copy failed — ${text}`);
      }
    },
    [session.roomCode, shareNotice],
  );

  // The latest terminal round (revealed or skipped) for results display in Lobby
  const terminalRounds = projection.rounds.filter((r) => isTerminalStatus(r.status));
  const latestRevealedRound: Round | null =
    terminalRounds.length > 0 ? terminalRounds.at(-1)! : null;

  const canExport = terminalRounds.length > 0;

  const handleExportResults = useCallback(
    () => exportResultsToClipboard(projection, (s) => clipboard.write(s), exportNotice.show),
    [projection, exportNotice.show],
  );

  // Agenda-add two-step prompt flow (title → ticketId)
  const handleAgendaAddStart = useCallback(() => {
    setAgendaAddTitleInput('');
    setAgendaAddPromptActive(true);
  }, []);

  const handleAgendaAddTitleSubmit = useCallback((title: string) => {
    setAgendaAddPromptActive(false);
    setAgendaAddTitleInput('');
    const normalized = title.trim() === '' ? undefined : title.trim();
    setPendingAgendaTitle(normalized);
    setAgendaAddTicketIdInput('');
    setAgendaAddTicketIdPromptActive(true);
  }, []);

  const handleAgendaAddTitleCancel = useCallback(() => {
    setAgendaAddPromptActive(false);
    setAgendaAddTitleInput('');
    setPendingAgendaTitle(undefined);
  }, []);

  const handleAgendaAddTicketIdSubmit = useCallback(
    (ticketId: string) => {
      setAgendaAddTicketIdPromptActive(false);
      setAgendaAddTicketIdInput('');
      const normalizedTicket = ticketId.trim() === '' ? undefined : ticketId.trim();

      if (!pendingAgendaTitle && !normalizedTicket) {
        // Both empty — silently abort
        setPendingAgendaTitle(undefined);
        return;
      }

      // The shared command stamps `createdAt`. Its one refusal reason here is
      // `'invalid-fields'`, which the guard above already covers — but the
      // result is reported rather than dropped, so this path keeps parity with
      // the mobile form and the one-shot `hnch agenda add` instead of eating
      // the user's typing if that guard and the command ever disagree (#507).
      const result = addAgendaItem(session.doc, {
        ...(pendingAgendaTitle !== undefined && { title: pendingAgendaTitle }),
        ...(normalizedTicket !== undefined && { ticketId: normalizedTicket }),
      });
      if (!result.applied) {
        agendaNotice.show('Add failed — an agenda item needs a title or a ticket id');
        return;
      }
      setPendingAgendaTitle(undefined);
    },
    [session.doc, pendingAgendaTitle, agendaNotice],
  );

  const handleAgendaAddTicketIdCancel = useCallback(() => {
    setAgendaAddTicketIdPromptActive(false);
    setAgendaAddTicketIdInput('');
    setPendingAgendaTitle(undefined);
  }, []);

  return (
    <Box flexDirection="column">
      <StatusBar
        roomCode={session.roomCode}
        sessionName={projection.settings.name}
        status={status}
        isHost={isHost}
      />

      {hostNotice.notice && (
        <Box paddingX={1}>
          <Text color="yellow">{hostNotice.notice}</Text>
        </Box>
      )}

      {shareNotice.notice && (
        <Box paddingX={1}>
          <Text color={shareNotice.notice.startsWith('Copy failed') ? 'red' : 'green'}>
            {shareNotice.notice}
          </Text>
        </Box>
      )}

      {exportNotice.notice && (
        <Box paddingX={1}>
          <Text color={exportNotice.notice.startsWith('Clipboard write failed') ? 'red' : 'green'}>
            {exportNotice.notice}
          </Text>
        </Box>
      )}

      {agendaNotice.notice && (
        <Box paddingX={1}>
          <Text color="red">{agendaNotice.notice}</Text>
        </Box>
      )}

      {settingsOpen ? (
        <LobbySettings
          sessionName={projection.settings.name}
          displayName={displayNameLocal}
          currentScale={projection.settings.defaultScale}
          accessMode={accessMode}
          presetOverrides={presetOverrides}
          customScales={customScales}
          isHost={isHost}
          onChangeName={handleChangeName}
          onChangeScale={handleChangeScale}
          onChangeDisplayName={handleChangeDisplayName}
          onChangeAccess={handleChangeAccess}
          onClose={handleCloseSettings}
        />
      ) : screen === 'lobby' ? (
        <Lobby
          projection={projection}
          onlineIds={onlineIds}
          isHost={isHost}
          participantId={participantId}
          rounds={projection.rounds}
          currentRound={latestRevealedRound}
          settingsOpen={settingsOpen}
          onStartRound={handleStartRoundPrompt}
          onNewRound={handleNewRound}
          roundTitlePromptActive={roundTitlePromptActive}
          roundTitleInput={roundTitleInput}
          onRoundTitleChange={setRoundTitleInput}
          onRoundTitleSubmit={handleRoundTitleSubmit}
          onRoundTitleCancel={handleRoundTitleCancel}
          roundTicketIdPromptActive={roundTicketIdPromptActive}
          roundTicketIdInput={roundTicketIdInput}
          onRoundTicketIdChange={setRoundTicketIdInput}
          onRoundTicketIdSubmit={handleRoundTicketIdSubmit}
          onRoundTicketIdCancel={handleRoundTicketIdCancel}
          onRevote={handleRevote}
          onOpenSettings={handleOpenSettings}
          onHandoffHost={handleHandoffHost}
          onEndSession={handleEndSession}
          onShare={handleShare}
          shareOpen={shareOpen}
          onSetShareOpen={setShareOpen}
          roomCode={session.roomCode}
          confirmingQuit={confirmingQuit}
          myRole={myRole}
          onToggleRole={handleToggleRole}
          descriptorPromptActive={descriptorPromptActive}
          descriptorInput={descriptorInput}
          onDescriptorChange={setDescriptorInput}
          onDescriptorSubmit={handleDescriptorSubmit}
          onDescriptorCancel={handleDescriptorCancel}
          onEditDescriptor={handleEditDescriptor}
          canExport={canExport}
          onExportResults={handleExportResults}
          onAgendaAdd={handleAgendaAddStart}
          agendaAddPromptActive={agendaAddPromptActive}
          agendaAddTitleInput={agendaAddTitleInput}
          onAgendaAddTitleChange={setAgendaAddTitleInput}
          onAgendaAddTitleSubmit={handleAgendaAddTitleSubmit}
          onAgendaAddTitleCancel={handleAgendaAddTitleCancel}
          agendaAddTicketIdPromptActive={agendaAddTicketIdPromptActive}
          agendaAddTicketIdInput={agendaAddTicketIdInput}
          onAgendaAddTicketIdChange={setAgendaAddTicketIdInput}
          onAgendaAddTicketIdSubmit={handleAgendaAddTicketIdSubmit}
          onAgendaAddTicketIdCancel={handleAgendaAddTicketIdCancel}
        />
      ) : screen === 'estimating' && round ? (
        <Voting
          projection={projection}
          round={round}
          onlineIds={onlineIds}
          isHost={isHost}
          myId={participantId}
          myRole={myRole}
          elapsedMs={elapsedMs}
          onToggleCurrentVote={handleToggleCurrentVote}
          onClearCurrentVote={handleClearCurrentVote}
          onReveal={handleReveal}
          onSkip={handleSkip}
          onDiscard={handleDiscard}
          onToggleRole={handleToggleRole}
          onShare={handleShare}
          onSetShareOpen={setShareOpen}
          shareOpen={shareOpen}
          settingsOpen={settingsOpen}
          onOpenSettings={handleOpenSettings}
          roomCode={session.roomCode}
          confirmingQuit={confirmingQuit}
        />
      ) : null}

      {confirmingQuit && (
        <Box>
          <Text dimColor>Leave session? y/n</Text>
        </Box>
      )}
    </Box>
  );
}
