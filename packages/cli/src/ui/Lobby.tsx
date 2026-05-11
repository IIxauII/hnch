import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { isConsensus } from '@hnch/shared';
import { ParticipantList } from './components/ParticipantList.js';
import { HostActionsMenu } from './components/HostActionsMenu.js';
import { SharePicker } from './components/SharePicker.js';
import { TextInput } from './components/TextInput.js';
import { compactRoundSummary, computeStats, formatElapsed } from './lobby-helpers.js';
import type { DocProjection, Round } from '@hnch/shared';

interface Props {
  projection: DocProjection;
  onlineIds: Set<string>;
  isHost: boolean;
  participantId: string;
  rounds: readonly Round[];
  /** The latest revealed round (null if no rounds revealed yet). */
  currentRound: Round | null;
  settingsOpen: boolean;
  onStartRound: () => void;
  onNewRound: () => void;
  onRevote: () => void;
  roundTitlePromptActive: boolean;
  roundTitleInput: string;
  onRoundTitleChange: (value: string) => void;
  onRoundTitleSubmit: (value: string) => void;
  onRoundTitleCancel: () => void;
  onOpenSettings: () => void;
  onHandoffHost: (targetId: string) => void;
  onEndSession: () => void;
  onShare: (kind: 'code' | 'url' | 'npx') => void;
  shareOpen: boolean;
  onSetShareOpen: (open: boolean) => void;
  roomCode: string;
  confirmingQuit: boolean;
  myRole: 'voter' | 'viewer';
  onToggleRole: () => void;
  descriptorPromptActive: boolean;
  descriptorInput: string;
  onDescriptorChange: (value: string) => void;
  onDescriptorSubmit: (value: string) => void;
  onDescriptorCancel: () => void;
  onEditDescriptor: () => void;
}

export function Lobby({
  projection,
  onlineIds,
  isHost,
  participantId,
  rounds,
  currentRound,
  settingsOpen,
  onStartRound,
  onNewRound,
  onRevote,
  onOpenSettings,
  onHandoffHost,
  onEndSession,
  onShare,
  shareOpen,
  onSetShareOpen,
  roomCode,
  confirmingQuit,
  myRole,
  onToggleRole,
  roundTitlePromptActive,
  roundTitleInput,
  onRoundTitleChange,
  onRoundTitleSubmit,
  onRoundTitleCancel,
  descriptorPromptActive,
  descriptorInput,
  onDescriptorChange,
  onDescriptorSubmit,
  onDescriptorCancel,
  onEditDescriptor,
}: Props): React.ReactElement {
  const [handoffMode, setHandoffMode] = React.useState<'idle' | 'picking' | 'confirming'>('idle');
  const [handoffTargetId, setHandoffTargetId] = React.useState<string | null>(null);
  const [hostMenuOpen, setHostMenuOpen] = React.useState(false);
  const [confirmingEndSession, setConfirmingEndSession] = React.useState(false);

  // Reset handoff state and host-only overlays when host role lost
  useEffect(() => {
    if (!isHost) {
      setHandoffMode('idle');
      setHandoffTargetId(null);
      setHostMenuOpen(false);
      setConfirmingEndSession(false);
    }
  }, [isHost]);

  useInput(
    (input) => {
      if (input === 'c' || input === 'C') {
        onSetShareOpen(true);
        return;
      }
      if (input === 'w' || input === 'W') {
        onToggleRole();
        return;
      }
      if (isHost) {
        if (input === 'e' || input === 'E') onOpenSettings();
        if (input === 's' || input === 'S') onStartRound();
        if (input === 'h' || input === 'H') setHandoffMode('picking');
        if (input === 'm' || input === 'M') setHostMenuOpen(true);
        if (currentRound?.revealedAt !== undefined) {
          if (input === 'n' || input === 'N') onNewRound();
          if (input === 'v' || input === 'V') onRevote();
          if (input === 't' || input === 'T') onEditDescriptor();
        }
      }
    },
    {
      isActive:
        !settingsOpen &&
        !confirmingQuit &&
        handoffMode === 'idle' &&
        !roundTitlePromptActive &&
        !hostMenuOpen &&
        !confirmingEndSession &&
        !shareOpen &&
        !descriptorPromptActive,
    },
  );

  // End session confirmation
  useInput(
    (input, key) => {
      if (input === 'y' || input === 'Y') {
        onEndSession();
        setConfirmingEndSession(false);
      } else if (input === 'n' || input === 'N' || key.escape) {
        setConfirmingEndSession(false);
      }
    },
    { isActive: confirmingEndSession },
  );

  // Handoff picking mode: number selection from online participants (excluding self)
  const otherOnlineParticipants = projection.participants.filter(
    (p) => p.id !== participantId && onlineIds.has(p.id),
  );

  useInput(
    (input) => {
      if (handoffMode === 'picking') {
        const num = parseInt(input, 10);
        if (!isNaN(num) && num >= 1 && num <= otherOnlineParticipants.length) {
          setHandoffTargetId(otherOnlineParticipants[num - 1]!.id);
          setHandoffMode('confirming');
        } else if (input === 'Escape' || input === 'q' || input === 'Q') {
          setHandoffMode('idle');
        }
      }
    },
    { isActive: handoffMode === 'picking' },
  );

  // Handoff confirmation: y/n
  useInput(
    (input) => {
      if (handoffMode === 'confirming' && handoffTargetId) {
        if (input === 'y' || input === 'Y') {
          onHandoffHost(handoffTargetId);
          setHandoffMode('idle');
          setHandoffTargetId(null);
        } else if (input === 'n' || input === 'N' || input === 'Escape') {
          setHandoffMode('idle');
          setHandoffTargetId(null);
        }
      }
    },
    { isActive: handoffMode === 'confirming' },
  );

  const hasRounds = rounds.length > 0;
  const revealedRounds = rounds.filter((r) => r.revealedAt !== undefined);

  // Past rounds = all revealed rounds except the latest (shown in full)
  const pastRounds = currentRound !== null ? revealedRounds.slice(0, -1) : revealedRounds;

  if (hostMenuOpen) {
    return (
      <HostActionsMenu
        onPick={(value) => {
          setHostMenuOpen(false);
          if (value === 'end-session') setConfirmingEndSession(true);
        }}
        onClose={() => setHostMenuOpen(false)}
      />
    );
  }

  if (shareOpen) {
    return (
      <SharePicker
        roomCode={roomCode}
        onPick={(kind) => {
          onSetShareOpen(false);
          onShare(kind);
        }}
        onClose={() => onSetShareOpen(false)}
      />
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{hasRounds ? 'Session' : 'Waiting for participants...'}</Text>
      {!hasRounds && <Text dimColor>No rounds started yet.</Text>}

      <ParticipantList
        participants={projection.participants}
        onlineIds={onlineIds}
        hostId={projection.settings.hostParticipantId}
        votes={{}}
        revealed={false}
        participantId={participantId}
      />

      {currentRound?.revealedAt !== undefined && (
        <ResultsSection projection={projection} round={currentRound} rounds={rounds} />
      )}

      {pastRounds.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>── History ──</Text>
          {pastRounds.map((r) => {
            const roundNum = rounds.indexOf(r) + 1;
            return (
              <Text key={r.id} dimColor>
                {compactRoundSummary(r, roundNum)}
              </Text>
            );
          })}
        </Box>
      )}

      {handoffMode === 'picking' && otherOnlineParticipants.length > 0 && (
        <Box flexDirection="column" gap={1}>
          <Text>Hand off to:</Text>
          {otherOnlineParticipants.map((p, idx) => (
            <Text key={p.id}>
              [{idx + 1}] {p.displayName}
            </Text>
          ))}
          <Text dimColor>[q] Cancel</Text>
        </Box>
      )}

      {handoffMode === 'picking' && otherOnlineParticipants.length === 0 && (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>No other online participants</Text>
          <Text dimColor>[q] Cancel</Text>
        </Box>
      )}

      {handoffMode === 'confirming' && handoffTargetId && (
        <Box flexDirection="column">
          <Text>
            Hand off to {projection.participants.find((p) => p.id === handoffTargetId)?.displayName}
            ? [y/n]
          </Text>
        </Box>
      )}

      {roundTitlePromptActive && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text>Round title (optional, Enter to skip):</Text>
            <TextInput
              value={roundTitleInput}
              onChange={onRoundTitleChange}
              onSubmit={onRoundTitleSubmit}
              onCancel={onRoundTitleCancel}
              placeholder="Enter to skip"
              isActive={roundTitlePromptActive}
            />
          </Box>
          <Text dimColor>[Esc] Cancel</Text>
        </Box>
      )}

      {descriptorPromptActive && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text>Edit round title:</Text>
            <TextInput
              value={descriptorInput}
              onChange={onDescriptorChange}
              onSubmit={onDescriptorSubmit}
              onCancel={onDescriptorCancel}
              placeholder="Enter to save"
              isActive={descriptorPromptActive}
            />
          </Box>
          <Text dimColor>[Esc] Cancel · empty submit cancels</Text>
        </Box>
      )}

      {confirmingEndSession && (
        <Box>
          <Text color="red">End session for everyone? This cannot be undone. </Text>
          <Text dimColor>y/n [Esc] Cancel</Text>
        </Box>
      )}

      {handoffMode === 'idle' &&
        !roundTitlePromptActive &&
        !descriptorPromptActive &&
        !confirmingEndSession && (
          <Box gap={2}>
            {isHost ? (
              <>
                {currentRound?.revealedAt !== undefined ? (
                  <>
                    <Text color="yellow">[v] Revote</Text>
                    <Text color="yellow">[n] Next</Text>
                    <Text color="yellow">[t] Edit title</Text>
                    <Text color="yellow">[h] Handoff</Text>
                    <Text color="yellow">[e] Settings</Text>
                    <Text color="yellow">[c] Share</Text>
                    <Text color="yellow">[w] {myRole === 'viewer' ? 'Vote' : 'Observe'}</Text>
                    <Text color="yellow">[m] Menu</Text>
                  </>
                ) : (
                  <>
                    <Text color="yellow">[s] Start round</Text>
                    <Text color="yellow">[h] Handoff</Text>
                    <Text color="yellow">[e] Settings</Text>
                    <Text color="yellow">[c] Share</Text>
                    <Text color="yellow">[w] {myRole === 'viewer' ? 'Vote' : 'Observe'}</Text>
                    <Text color="yellow">[m] Menu</Text>
                  </>
                )}
              </>
            ) : (
              <>
                <Text dimColor>Waiting for host to start a round...</Text>
                <Text>[c] Share</Text>
                <Text color="yellow">[w] {myRole === 'viewer' ? 'Vote' : 'Observe'}</Text>
              </>
            )}
            <Text>[q] Quit</Text>
          </Box>
        )}
    </Box>
  );
}

interface ResultsSectionProps {
  projection: DocProjection;
  round: Round;
  rounds: readonly Round[];
}

function ResultsSection({ projection, round, rounds }: ResultsSectionProps): React.ReactElement {
  const roundNum = rounds.indexOf(round) + 1;
  const title = round.title ? ` — ${round.title}` : '';
  const ticket = round.ticketId ? ` [${round.ticketId}]` : '';
  const stats = computeStats(round.votes);
  const nameMap = new Map(projection.participants.map((p) => [p.id, p.displayName]));

  const elapsed =
    round.timerStartedAt !== undefined && round.revealedAt !== undefined
      ? formatElapsed(round.timerStartedAt, round.revealedAt)
      : null;

  const uniqueVote = Object.values(round.votes)[0];

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>
        Round {roundNum}
        {title}
        {ticket} — Results
      </Text>

      {isConsensus(round) && (
        <Text bold color="green">
          Consensus! Everyone voted {uniqueVote}
        </Text>
      )}

      <Box flexDirection="column">
        <Box gap={2}>
          <Text bold underline>
            {'Name'.padEnd(20)}
          </Text>
          <Text bold underline>
            {'Estimate'.padEnd(10)}
          </Text>
        </Box>
        {Object.entries(round.votes).map(([pid, vote]) => (
          <Box key={pid} gap={2}>
            <Text>{(nameMap.get(pid) ?? pid).padEnd(20)}</Text>
            <Text color="cyan" bold>
              {vote.padEnd(10)}
            </Text>
          </Box>
        ))}
        {projection.participants
          .filter((p) => !(p.id in round.votes))
          .map((p) => (
            <Box key={p.id} gap={2}>
              <Text dimColor>{p.displayName.padEnd(20)}</Text>
              <Text dimColor>{'(no vote)'.padEnd(10)}</Text>
            </Box>
          ))}
      </Box>

      <Box gap={2}>
        <Text>
          Avg: <Text bold>{stats.average}</Text>
        </Text>
        <Text>
          Med: <Text bold>{stats.median}</Text>
        </Text>
        <Text>
          Agreement: <Text bold>{stats.agreement}</Text>
        </Text>
        {elapsed !== null && <Text dimColor>⏱ {elapsed}</Text>}
      </Box>
    </Box>
  );
}
