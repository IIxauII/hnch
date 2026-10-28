import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ABSTAIN_SENTINEL, formatElapsed, isAbstainVote, roundNumber } from '@hnch/shared';
import { ParticipantList } from './components/ParticipantList.js';
import { CardPicker } from './components/CardPicker.js';
import { SharePicker } from './components/SharePicker.js';
import type { DocProjection, Round } from '@hnch/shared';

interface Props {
  projection: DocProjection;
  round: Round;
  onlineIds: ReadonlySet<string>;
  isHost: boolean;
  myId: string;
  myRole: 'voter' | 'viewer';
  elapsedMs?: number | undefined;
  roomCode: string;
  shareOpen: boolean;
  settingsOpen: boolean;
  onToggleCurrentVote: (card: string) => void;
  onClearCurrentVote: () => void;
  onReveal: () => void;
  onSkip: () => void;
  onDiscard: () => void;
  onToggleRole: () => void;
  onShare: (kind: 'code' | 'url' | 'npx') => void;
  onSetShareOpen: (open: boolean) => void;
  onOpenSettings: () => void;
  confirmingQuit: boolean;
}

export function Voting({
  projection,
  round,
  onlineIds,
  isHost,
  myId,
  myRole,
  elapsedMs,
  roomCode,
  shareOpen,
  settingsOpen,
  onToggleCurrentVote,
  onClearCurrentVote,
  onReveal,
  onSkip,
  onDiscard,
  onToggleRole,
  onShare,
  onSetShareOpen,
  onOpenSettings,
  confirmingQuit,
}: Props): React.ReactElement {
  const myVoteRaw = round.votes[myId];
  const isAbstained = myVoteRaw !== undefined && isAbstainVote(myVoteRaw);

  useInput(
    (input) => {
      if (input === 'e' || input === 'E') {
        onOpenSettings();
        return;
      }
      if (input === 'c' || input === 'C') {
        onSetShareOpen(true);
        return;
      }
      if (myRole === 'voter' && (input === 'a' || input === 'A')) {
        onToggleCurrentVote(ABSTAIN_SENTINEL);
        return;
      }
      if (isHost && (input === 'r' || input === 'R')) {
        onReveal();
      }
      if (isHost && (input === 's' || input === 'S')) {
        onSkip();
      }
      if (isHost && (input === 'd' || input === 'D')) {
        onDiscard();
      }
      if (input === 'w' || input === 'W') {
        onToggleRole();
      }
    },
    { isActive: !confirmingQuit && !settingsOpen && !shareOpen },
  );

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

  const myVote = myVoteRaw;
  const roundNum = roundNumber(round, projection.rounds);
  const title = round.title ? ` — ${round.title}` : '';
  const ticket = round.ticketId ? ` [${round.ticketId}]` : '';

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2}>
        <Text bold>
          Round {roundNum}
          {title}
          {ticket}
        </Text>
        {elapsedMs !== undefined && <Text dimColor>⏱ {formatElapsed(elapsedMs)}</Text>}
      </Box>

      <Box gap={4}>
        <ParticipantList
          participants={projection.participants}
          onlineIds={onlineIds}
          hostId={projection.settings.hostParticipantId}
          votes={round.votes}
          revealed={false}
        />

        {myRole === 'viewer' ? (
          <Box flexDirection="column">
            <Text dimColor>You're observing</Text>
          </Box>
        ) : (
          <Box flexDirection="column" gap={1}>
            {isAbstained && <Text dimColor>(abstaining this round — press [a] to vote)</Text>}
            <CardPicker
              scale={round.scale}
              selected={isAbstained ? undefined : myVote}
              onToggleCurrentVote={onToggleCurrentVote}
              onClearCurrentVote={onClearCurrentVote}
              disabled={confirmingQuit || isAbstained}
            />
          </Box>
        )}
      </Box>

      <Box gap={2}>
        {isHost && <Text color="yellow">[r] Reveal</Text>}
        {isHost && <Text color="yellow">[s] Skip</Text>}
        {isHost && <Text color="yellow">[d] Discard</Text>}
        {myRole === 'voter' && <Text color="yellow">[a] {isAbstained ? 'Vote' : 'Abstain'}</Text>}
        <Text color="yellow">[w] {myRole === 'viewer' ? 'Vote' : 'Observe'}</Text>
        <Text>[e] Settings</Text>
        <Text>[c] Share</Text>
        <Text>[q] Quit</Text>
      </Box>
    </Box>
  );
}
