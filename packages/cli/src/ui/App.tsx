import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { SessionHandle } from '../session.js';
import type { SyncStatus } from '../sync.js';
import type { DocProjection, Round, Scale, PresetOverrides, CustomScale } from '@hnch/shared';
import { currentRound, participantRole, terminalState } from '@hnch/shared';
import clipboard from 'clipboardy';
import { shareCode, shareUrl, shareNpxCommand } from '../share.js';
import { buildNewRoundArgs, normalizeRoundPromptValue } from './round-prompt-flow.js';
import { StatusBar } from './components/StatusBar.js';
import { LobbySettings } from './components/LobbySettings.js';
import { Lobby } from './Lobby.js';
import { Voting } from './Voting.js';
import { useTransientNotice } from './hooks/useTransientNotice.js';

interface Props {
  session: SessionHandle;
  participantId: string;
  displayName: string;
  accessMode: 'open' | 'password' | 'invite';
  presetOverrides?: PresetOverrides | undefined;
  customScales?: CustomScale[] | undefined;
}

type Screen = 'lobby' | 'voting';

function deriveScreen(projection: DocProjection): Screen {
  const round = currentRound(projection);
  if (!round) return 'lobby';
  if (terminalState(round) !== null) return 'lobby';
  return 'voting';
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
  const hostNotice = useTransientNotice(3000);
  const [shareOpen, setShareOpen] = useState(false);
  const shareNotice = useTransientNotice(3000);

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
      if (round?.timerStartedAt !== undefined && round.revealedAt === undefined) {
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
        !shareOpen,
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

  const screen = deriveScreen(projection);

  const round = currentRound(projection);
  const isHost = projection.settings.hostParticipantId === participantId;
  const myParticipant = projection.participants.find((p) => p.id === participantId);
  const myRole = participantRole(myParticipant ?? {});

  const handleStartRoundPrompt = useCallback(() => {
    setRoundTitleInput('');
    setRoundTitlePromptActive(true);
  }, []);

  const handleRoundTitleSubmit = useCallback((title: string) => {
    setRoundTitlePromptActive(false);
    setRoundTitleInput('');
    setPendingRoundTitle(normalizeRoundPromptValue(title));
    setRoundTicketIdInput('');
    setRoundTicketIdPromptActive(true);
  }, []);

  const handleRoundTitleCancel = useCallback(() => {
    setRoundTitlePromptActive(false);
    setRoundTitleInput('');
    setPendingRoundTitle(undefined);
  }, []);

  const handleRoundTicketIdSubmit = useCallback(
    (ticketId: string) => {
      setRoundTicketIdPromptActive(false);
      setRoundTicketIdInput('');
      const [title, normalizedTicketId] = buildNewRoundArgs(pendingRoundTitle, ticketId);
      session.newRound(title, normalizedTicketId);
      setPendingRoundTitle(undefined);
    },
    [session, pendingRoundTitle],
  );

  const handleRoundTicketIdCancel = useCallback(() => {
    setRoundTicketIdPromptActive(false);
    setRoundTicketIdInput('');
    setPendingRoundTitle(undefined);
  }, []);

  const handleEditDescriptor = useCallback(() => {
    const current = session.current();
    if (!current || current.revealedAt === undefined) return;
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

  const handleVote = useCallback(
    (card: string) => {
      session.vote(card);
    },
    [session],
  );

  const handleClearVote = useCallback(() => {
    session.unvote();
  }, [session]);

  const handleReveal = useCallback(() => {
    session.reveal();
  }, [session]);

  const handleSkip = useCallback(() => {
    session.skip();
  }, [session]);

  const handleNewRound = useCallback(() => {
    setRoundTitleInput('');
    setRoundTitlePromptActive(true);
  }, []);

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
      try {
        session.handoffHost(targetId);
      } catch (err) {
        console.error(`Handoff failed: ${err instanceof Error ? err.message : String(err)}`);
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
  const terminalRounds = projection.rounds.filter((r) => terminalState(r) !== null);
  const latestRevealedRound: Round | null =
    terminalRounds.length > 0 ? terminalRounds.at(-1)! : null;

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
        />
      ) : screen === 'voting' && round ? (
        <Voting
          projection={projection}
          round={round}
          onlineIds={onlineIds}
          isHost={isHost}
          myId={participantId}
          myRole={myRole}
          elapsedMs={elapsedMs}
          onVote={handleVote}
          onClearVote={handleClearVote}
          onReveal={handleReveal}
          onSkip={handleSkip}
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
