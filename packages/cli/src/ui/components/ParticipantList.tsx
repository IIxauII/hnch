import React from 'react';
import { Box, Text } from 'ink';
import { participantRole, type ParticipantSnapshot } from '@hnch/shared';

interface Props {
  participants: readonly ParticipantSnapshot[];
  onlineIds: ReadonlySet<string>;
  hostId?: string;
  votes: Record<string, string>;
  revealed: boolean;
  participantId?: string;
}

export function ParticipantList({
  participants,
  onlineIds,
  hostId,
  votes,
  revealed,
  participantId,
}: Props): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Participants ({participants.length})</Text>
      {participants.map((p) => {
        const online = onlineIds.has(p.id);
        const dot = online ? '●' : '○';
        const dotColor = online ? 'green' : 'gray';
        const isHost = p.id === hostId;
        const isViewer = participantRole(p) === 'viewer';
        const isSelf = p.id === participantId;
        const voted = p.id in votes;
        const voteIndicator = isViewer
          ? ' (viewer)'
          : revealed
            ? votes[p.id]
              ? ` → ${votes[p.id]}`
              : ''
            : voted
              ? ' ✓'
              : ' ·';
        const showVoterLabel = isSelf && !isViewer && !(revealed && votes[p.id]);

        return (
          <Box key={p.id} gap={1}>
            <Text color={dotColor}>{dot}</Text>
            <Text>
              {p.displayName}
              {isHost ? ' (host)' : ''}
            </Text>
            {showVoterLabel ? (
              <Text color="cyan">(voter)</Text>
            ) : (
              <Text color={isViewer ? 'gray' : voted ? 'green' : 'gray'}>{voteIndicator}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
