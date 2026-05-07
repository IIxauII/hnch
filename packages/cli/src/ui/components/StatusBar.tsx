import React from 'react';
import { Box, Text } from 'ink';
import type { SyncStatus } from '../../sync.js';

interface Props {
  roomCode: string;
  sessionName?: string;
  status: SyncStatus;
  isHost: boolean;
}

const STATUS_COLORS: Record<SyncStatus, string> = {
  connecting: 'yellow',
  connected: 'green',
  disconnected: 'red',
};

export function StatusBar({ roomCode, sessionName, status, isHost }: Props): React.ReactElement {
  const label = sessionName ? `${roomCode} · ${sessionName}` : roomCode;
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text bold>hnch · {label}</Text>
      <Box gap={2}>
        {isHost && <Text color="yellow">[host]</Text>}
        <Text color={STATUS_COLORS[status]}>{status}</Text>
      </Box>
    </Box>
  );
}
