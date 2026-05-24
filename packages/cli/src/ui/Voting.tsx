import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ABSTAIN_SENTINEL, isAbstainVote } from '@hnch/shared';
import { ParticipantList } from './components/ParticipantList.js';
import { CardPicker } from './components/CardPicker.js';
import { SharePicker } from './components/SharePicker.js';
import type { DocProjection, Round } from '@hnch/shared';

interface Props {
  projection: DocProjection;
  round: Round;
  onlineIds: Set<string>;
  isHost: boolean;
  myId: string;
  myRole: 'voter' | 'viewer';
  elapsedMs?: number | undefined;
  roomCode: string;
  shareOpen: boolean;
  settingsOpen: boolean;
  onVote: (card: string) => void;
  onClearVote: () => void;
  onReveal: () => void;
  onSkip: () => void;
  onDiscard: () => void;
  onToggleRole: () => void;
  onShare: (kind: 'code' | 'url' | 'npx') => void;
  onSetShareOpen: (open: boolean) => void;
  onOpenSettings: () => void;
  confirmingQuit: boolean;
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const min = Math.floor(secs / 60);
  const sec = secs % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
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
  onVote,
  onClearVote,
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
        if (isAbstained) {
          onClearVote();
        } else {
          onVote(ABSTAIN_SENTINEL);
        }
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
  const roundNum = projection.rounds.indexOf(round) + 1;
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
              onSelect={onVote}
              onClear={onClearVote}
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
