import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from './TextInput.js';

export interface AccessPickerProps {
  mode: 'open' | 'password';
  password: string;
  onModeChange: (mode: 'open' | 'password') => void;
  onPasswordChange: (password: string) => void;
  onClose?: () => void;
}

export function AccessPicker({
  mode,
  password,
  onModeChange,
  onPasswordChange,
  onClose,
}: AccessPickerProps): React.ReactElement {
  const [cursor, setCursor] = useState(mode === 'open' ? 0 : 1);
  const [editingPassword, setEditingPassword] = useState(false);

  useEffect(() => {
    setCursor(mode === 'open' ? 0 : 1);
  }, [mode]);

  useInput(
    (input, key) => {
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
      } else if (key.rightArrow) {
        setCursor((c) => Math.min(1, c + 1));
      } else if (key.return) {
        const newMode = cursor === 0 ? 'open' : 'password';
        if (newMode !== mode) {
          onModeChange(newMode);
        }
        if (newMode === 'password') {
          setEditingPassword(true);
        }
      } else if (key.escape) {
        onClose?.();
      }
    },
    { isActive: !editingPassword },
  );

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        {(['open', 'password'] as const).map((m, i) => {
          const isCursor = i === cursor;
          const isActive = m === mode;
          const label = m === 'open' ? 'Open' : 'Password';
          return (
            <Text key={m} inverse={isCursor} bold={isActive} color={isActive ? 'cyan' : undefined}>
              {isActive ? `[${label}]` : ` ${label} `}
            </Text>
          );
        })}
      </Box>

      {mode === 'password' && (
        <Box flexDirection="column" gap={1}>
          <Text>Password: </Text>
          <TextInput
            value={password}
            onChange={onPasswordChange}
            onSubmit={() => setEditingPassword(false)}
            onCancel={() => setEditingPassword(false)}
            placeholder="(required to join)"
            isActive={editingPassword}
            mask={true}
          />
          {!editingPassword && <Text dimColor>⏎ edit ← → switch mode esc close</Text>}
          {editingPassword && <Text dimColor>⏎ done esc cancel</Text>}
        </Box>
      )}

      {mode === 'open' && <Text dimColor>←→ toggle ⏎ confirm esc close</Text>}
    </Box>
  );
}
