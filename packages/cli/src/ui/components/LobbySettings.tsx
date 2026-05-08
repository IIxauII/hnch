import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import {
  buildAvailableScales,
  formatScaleId,
  type Scale,
  type PresetOverrides,
  type CustomScale,
} from '@hnch/shared';
import { MenuList } from './MenuList.js';
import { AccessPicker } from './AccessPicker.js';
import { TextInput } from './TextInput.js';
import { ScalePicker } from './ScalePicker.js';
import { writeConfig } from '../../config.js';

export interface LobbySettingsProps {
  sessionName: string | undefined;
  displayName: string;
  currentScale: Scale;
  accessMode: 'open' | 'password' | 'invite';
  presetOverrides?: PresetOverrides | undefined;
  customScales?: CustomScale[] | undefined;
  /** When false (joiner), only Display name row is shown. Defaults to true. */
  isHost?: boolean | undefined;
  onChangeName: (name: string | undefined) => void;
  onChangeScale: (scale: Scale) => void;
  onChangeDisplayName: (name: string) => void;
  onChangeAccess: (mode: 'open' | 'password', password?: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Filters a settings menu item list for the current participant's role.
 * Hosts see all items; joiners see only `display-name`.
 * Exported for unit testing — mirrors the component's runtime filter exactly.
 */
export function filterSettingsItems<T extends { value: string }>(
  items: readonly T[],
  isHost: boolean,
): T[] {
  return isHost ? [...items] : items.filter((i) => i.value === 'display-name');
}

type SettingsState =
  | 'main-menu'
  | 'editing-room-name'
  | 'editing-display-name'
  | 'picking-scale'
  | 'picking-access';

export function LobbySettings({
  sessionName,
  displayName,
  currentScale,
  accessMode,
  presetOverrides,
  customScales,
  isHost = true,
  onChangeName,
  onChangeScale,
  onChangeDisplayName,
  onChangeAccess,
  onClose,
}: LobbySettingsProps): React.ReactElement {
  const [localOverrides, setLocalOverrides] = useState<PresetOverrides>(presetOverrides ?? {});
  const scales = useMemo(
    () => buildAvailableScales(localOverrides, customScales),
    [localOverrides, customScales],
  );
  const [state, setState] = useState<SettingsState>('main-menu');
  const [roomNameInput, setRoomNameInput] = useState(sessionName ?? '');
  const [displayNameInput, setDisplayNameInput] = useState(displayName);
  const [accessModeLocal, setAccessModeLocal] = useState<'open' | 'password'>(
    accessMode === 'password' ? 'password' : 'open',
  );
  const [passwordInput, setPasswordInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const allMenuItems = [
    {
      label: 'Room name',
      value: 'room-name',
      detail: `[${sessionName ?? '(none)'}]`,
    },
    {
      label: 'Scale',
      value: 'scale',
      detail: `[${formatScaleId(currentScale.id)}]`,
    },
    {
      label: 'Access',
      value: 'access',
      detail: `[${accessMode === 'open' ? 'Open' : 'Password'}]`,
    },
    {
      label: 'Display name',
      value: 'display-name',
      detail: `[${displayName}]`,
    },
  ];

  // Joiners see only Display name; host items hidden to prevent mutation
  const menuItems = filterSettingsItems(allMenuItems, isHost);

  function handleMenuSelect(value: string) {
    if (!isHost && value !== 'display-name') return;
    if (value === 'room-name') {
      setRoomNameInput(sessionName ?? '');
      setState('editing-room-name');
    } else if (value === 'scale') {
      setState('picking-scale');
    } else if (value === 'access') {
      setState('picking-access');
    } else if (value === 'display-name') {
      setDisplayNameInput(displayName);
      setState('editing-display-name');
    }
  }

  function handleRoomNameSubmit(val: string) {
    const trimmed = val.trim() === '' ? undefined : val.trim();
    onChangeName(trimmed);
    setState('main-menu');
  }

  function handleDisplayNameSubmit(val: string) {
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      onChangeDisplayName(trimmed);
      process.nextTick(() => writeConfig({ displayName: trimmed }));
    }
    setState('main-menu');
  }

  function handleScaleSelect(id: string) {
    const selected = scales.find((s) => s.id === id);
    if (selected) {
      onChangeScale(selected);
    }
    setState('main-menu');
  }

  function handleScaleOverrideChange(scaleId: string, disabledIndices: number[]) {
    const updated = { ...localOverrides };
    if (disabledIndices.length === 0) {
      delete updated[scaleId];
    } else {
      updated[scaleId] = disabledIndices;
    }
    setLocalOverrides(updated);
    writeConfig({ presetOverrides: Object.keys(updated).length > 0 ? updated : undefined });
  }

  async function handleAccessSubmit(mode: 'open' | 'password', password?: string) {
    setIsUpdating(true);
    try {
      await onChangeAccess(mode, password);
      setAccessModeLocal(mode);
      if (mode === 'password') {
        setPasswordInput(password ?? '');
      } else {
        setPasswordInput('');
      }
    } catch (err) {
      console.error(`Failed to update access: ${err}`);
    } finally {
      setIsUpdating(false);
      setState('main-menu');
    }
  }

  if (state === 'main-menu') {
    return (
      <MenuList
        title="── Settings ──"
        items={menuItems}
        onSelect={handleMenuSelect}
        onClose={onClose}
      />
    );
  }

  if (state === 'editing-room-name') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Settings ──</Text>
        <Text>Room name: </Text>
        <TextInput
          value={roomNameInput}
          onChange={setRoomNameInput}
          onSubmit={handleRoomNameSubmit}
          onCancel={() => setState('main-menu')}
          placeholder="(leave empty to remove)"
          isActive
        />
        <Text dimColor>⏎ confirm esc back</Text>
      </Box>
    );
  }

  if (state === 'editing-display-name') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Settings ──</Text>
        <Text>Display name: </Text>
        <TextInput
          value={displayNameInput}
          onChange={setDisplayNameInput}
          onSubmit={handleDisplayNameSubmit}
          onCancel={() => setState('main-menu')}
          placeholder="(required)"
          isActive
        />
        <Text dimColor>⏎ confirm esc back</Text>
      </Box>
    );
  }

  if (state === 'picking-scale') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Settings ──</Text>
        <ScalePicker
          scales={scales}
          selectedScaleId={currentScale.id}
          presetOverrides={localOverrides}
          onSelect={handleScaleSelect}
          onOverrideChange={handleScaleOverrideChange}
          onClose={() => setState('main-menu')}
        />
      </Box>
    );
  }

  if (state === 'picking-access') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Settings ──</Text>
        {isUpdating && <Text dimColor>Updating access...</Text>}
        {!isUpdating && (
          <AccessPicker
            mode={accessModeLocal}
            password={passwordInput}
            onModeChange={(mode) => {
              if (mode === 'open') {
                handleAccessSubmit('open');
              }
            }}
            onPasswordChange={setPasswordInput}
            onClose={() => setState('main-menu')}
          />
        )}
      </Box>
    );
  }

  return <Box />;
}
