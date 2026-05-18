import React, { useState, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { randomUUID } from 'node:crypto';
import {
  ACCENTS,
  AVATAR_PALETTE_KEYS,
  buildAvailableScales,
  getScaleLabel,
  parseAvatarColor,
  type AccentKey,
  type CustomScale,
  type PresetOverrides,
  type Scale,
} from '@hnch/shared';
import { readConfig, writeConfig, updateConfig, type CliConfig } from '../../config.js';
import { MenuList, type MenuItem } from './MenuList.js';
import { TextInput } from './TextInput.js';
import { ScalePicker } from './ScalePicker.js';

interface ConfigSettingsProps {
  presetOverrides?: PresetOverrides | undefined;
  customScales?: CustomScale[] | undefined;
}

type SettingsState =
  | 'main-menu'
  | 'editing-display-name'
  | 'editing-relay-url'
  | 'editing-session-name'
  | 'picking-scale'
  | 'picking-default-password'
  | 'picking-avatar-color'
  | 'editing-avatar-hex';

export function ConfigSettings({
  presetOverrides,
  customScales,
}: ConfigSettingsProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<SettingsState>('main-menu');
  const [config, setConfig] = useState<Partial<CliConfig>>(readConfig());
  const [displayNameInput, setDisplayNameInput] = useState(config.displayName ?? '');
  const [relayUrlInput, setRelayUrlInput] = useState(config.relayUrl ?? '');
  const [sessionNameInput, setSessionNameInput] = useState(config.defaultSessionName ?? '');
  const [avatarHexInput, setAvatarHexInput] = useState(
    config.avatarColor?.startsWith('#') ? config.avatarColor : '',
  );
  const [localCustomScales, setLocalCustomScales] = useState<CustomScale[]>(customScales ?? []);
  const [localOverrides, setLocalOverrides] = useState<PresetOverrides>(presetOverrides ?? {});

  // Global quit handler
  useInput(
    (input) => {
      if (input === 'q' || input === 'Q') {
        exit();
      }
    },
    { isActive: state === 'main-menu' },
  );

  const scales = useMemo(
    () => buildAvailableScales(localOverrides, localCustomScales),
    [localOverrides, localCustomScales],
  );
  const currentScale = config.defaultScale;
  const currentScaleObj = currentScale ? scales.find((s) => s.id === currentScale) : undefined;

  const menuItems: MenuItem[] = [
    {
      label: 'Display name',
      value: 'display-name',
      detail: `[${config.displayName ?? '(none)'}]`,
    },
    {
      label: 'Relay URL',
      value: 'relay-url',
      detail: `[${config.relayUrl ?? '(none)'}]`,
    },
    {
      label: 'Default scale',
      value: 'default-scale',
      detail: `[${currentScaleObj ? getScaleLabel(currentScaleObj.id, localCustomScales) : '(none)'}]`,
    },
    {
      label: 'Default session name',
      value: 'default-session-name',
      detail: `[${config.defaultSessionName ?? '(none)'}]`,
    },
    {
      label: 'Default password',
      value: 'default-password',
      detail: `[${config.defaultPassword ? 'on' : 'off'}]`,
    },
    {
      label: 'Avatar color',
      value: 'avatar-color',
      detail: `[${avatarColorLabel(config.avatarColor)}]`,
    },
  ];

  function handleMenuSelect(value: string) {
    if (value === 'display-name') {
      setDisplayNameInput(config.displayName ?? '');
      setState('editing-display-name');
    } else if (value === 'relay-url') {
      setRelayUrlInput(config.relayUrl ?? '');
      setState('editing-relay-url');
    } else if (value === 'default-scale') {
      setState('picking-scale');
    } else if (value === 'default-session-name') {
      setSessionNameInput(config.defaultSessionName ?? '');
      setState('editing-session-name');
    } else if (value === 'default-password') {
      setState('picking-default-password');
    } else if (value === 'avatar-color') {
      setState('picking-avatar-color');
    }
  }

  function handleAvatarColorSelect(value: string) {
    if (value === 'custom-hex') {
      setAvatarHexInput(config.avatarColor?.startsWith('#') ? config.avatarColor : '');
      setState('editing-avatar-hex');
      return;
    }
    if (parseAvatarColor(value) === null) {
      setState('main-menu');
      return;
    }
    setConfig({ ...config, avatarColor: value });
    writeConfig({ avatarColor: value });
    setState('main-menu');
  }

  function handleAvatarHexSubmit(val: string) {
    const trimmed = val.trim();
    if (trimmed.length === 0) {
      setState('picking-avatar-color');
      return;
    }
    const normalized = trimmed.startsWith('#')
      ? trimmed.toLowerCase()
      : `#${trimmed.toLowerCase()}`;
    if (parseAvatarColor(normalized) === null) {
      // Stay in editor; user will retry or cancel.
      return;
    }
    setConfig({ ...config, avatarColor: normalized });
    writeConfig({ avatarColor: normalized });
    setState('main-menu');
  }

  function handleDisplayNameSubmit(val: string) {
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      const updated = { ...config, displayName: trimmed };
      setConfig(updated);
      writeConfig({ displayName: trimmed });
    }
    setState('main-menu');
  }

  function handleRelayUrlSubmit(val: string) {
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      const updated = { ...config, relayUrl: trimmed };
      setConfig(updated);
      writeConfig({ relayUrl: trimmed });
    }
    setState('main-menu');
  }

  function handleSessionNameSubmit(val: string) {
    const trimmed = val.trim();
    const updated = trimmed.length > 0 ? { ...config, defaultSessionName: trimmed } : { ...config };
    if (trimmed.length === 0) {
      delete updated.defaultSessionName;
      setConfig(updated);
      updateConfig({ defaultSessionName: '' });
    } else {
      setConfig(updated);
      writeConfig({ defaultSessionName: trimmed });
    }
    setState('main-menu');
  }

  function handleScaleSelect(id: string) {
    const updated = id.length > 0 ? { ...config, defaultScale: id } : { ...config };
    if (id.length === 0) {
      delete updated.defaultScale;
      setConfig(updated);
      updateConfig({ defaultScale: '' });
    } else {
      setConfig(updated);
      writeConfig({ defaultScale: id });
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

  function handlePasswordToggle(value: string) {
    const isOn = value === 'on';
    const updated = { ...config, defaultPassword: isOn };
    setConfig(updated);
    writeConfig({ defaultPassword: isOn });
    setState('main-menu');
  }

  function handleCustomScaleCreate(name: string, cards: string[]) {
    const id = `custom-${randomUUID()}`;
    const newCustomScales = [...localCustomScales, { id, label: name, cards }];
    setLocalCustomScales(newCustomScales);
    setConfig({ ...config, customScales: newCustomScales });
    writeConfig({ customScales: newCustomScales });
  }

  function handleCustomScaleEdit(id: string, name: string, cards: string[]) {
    const newCustomScales = localCustomScales.map((s) =>
      s.id === id ? { id, label: name, cards } : s,
    );
    setLocalCustomScales(newCustomScales);
    setConfig({ ...config, customScales: newCustomScales });
    writeConfig({ customScales: newCustomScales });
  }

  function handleCustomScaleDelete(id: string) {
    const newCustomScales = localCustomScales.filter((s) => s.id !== id);
    setLocalCustomScales(newCustomScales);
    let updated = { ...config, customScales: newCustomScales };
    if (config.defaultScale === id) {
      updated.defaultScale = 'fibonacci';
      writeConfig({ customScales: newCustomScales, defaultScale: 'fibonacci' });
    } else {
      writeConfig({ customScales: newCustomScales });
    }
    setConfig(updated);
  }

  if (state === 'main-menu') {
    return (
      <MenuList
        title="── Config Settings ──"
        items={menuItems}
        onSelect={handleMenuSelect}
        onClose={() => exit()}
      />
    );
  }

  if (state === 'editing-display-name') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Config Settings ──</Text>
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

  if (state === 'editing-relay-url') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Config Settings ──</Text>
        <Text>Relay URL: </Text>
        <TextInput
          value={relayUrlInput}
          onChange={setRelayUrlInput}
          onSubmit={handleRelayUrlSubmit}
          onCancel={() => setState('main-menu')}
          placeholder="(required)"
          isActive
        />
        <Text dimColor>⏎ confirm esc back</Text>
      </Box>
    );
  }

  if (state === 'editing-session-name') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Config Settings ──</Text>
        <Text>Default session name: </Text>
        <TextInput
          value={sessionNameInput}
          onChange={setSessionNameInput}
          onSubmit={handleSessionNameSubmit}
          onCancel={() => setState('main-menu')}
          placeholder="(leave empty to clear)"
          isActive
        />
        <Text dimColor>⏎ confirm esc back</Text>
      </Box>
    );
  }

  if (state === 'picking-scale') {
    const scalesWithNone: Scale[] = [{ id: '', cards: [] }, ...scales];
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Config Settings ──</Text>
        <ScalePicker
          scales={scalesWithNone}
          selectedScaleId={currentScale ?? ''}
          presetOverrides={localOverrides}
          customScales={localCustomScales}
          onSelect={handleScaleSelect}
          onOverrideChange={handleScaleOverrideChange}
          onCustomScaleCreate={handleCustomScaleCreate}
          onCustomScaleEdit={handleCustomScaleEdit}
          onCustomScaleDelete={handleCustomScaleDelete}
          onClose={() => setState('main-menu')}
          showNoneOption
        />
      </Box>
    );
  }

  if (state === 'picking-avatar-color') {
    const paletteItems: MenuItem[] = (AVATAR_PALETTE_KEYS as readonly AccentKey[]).map((key) => ({
      label: ACCENTS[key].label,
      value: key,
      detail: config.avatarColor === key ? '[current]' : ACCENTS[key].base,
    }));
    paletteItems.push({
      label: 'Custom hex…',
      value: 'custom-hex',
      detail: config.avatarColor?.startsWith('#') ? `[${config.avatarColor}]` : undefined,
    });
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Config Settings ──</Text>
        <MenuList
          title="Avatar color:"
          items={paletteItems}
          onSelect={handleAvatarColorSelect}
          onClose={() => setState('main-menu')}
        />
      </Box>
    );
  }

  if (state === 'editing-avatar-hex') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Config Settings ──</Text>
        <Text>Custom hex color: </Text>
        <TextInput
          value={avatarHexInput}
          onChange={setAvatarHexInput}
          onSubmit={handleAvatarHexSubmit}
          onCancel={() => setState('picking-avatar-color')}
          placeholder="#rrggbb"
          isActive
        />
        <Text dimColor>⏎ confirm esc back</Text>
      </Box>
    );
  }

  if (state === 'picking-default-password') {
    const passwordItems = [
      { label: 'On', value: 'on', detail: config.defaultPassword ? '[current]' : undefined },
      { label: 'Off', value: 'off', detail: !config.defaultPassword ? '[current]' : undefined },
    ];

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>── Config Settings ──</Text>
        <MenuList
          title="Default password:"
          items={passwordItems}
          onSelect={handlePasswordToggle}
          onClose={() => setState('main-menu')}
        />
      </Box>
    );
  }

  return <Box />;
}

function avatarColorLabel(value: string | undefined): string {
  if (!value) return '(auto)';
  if (value.startsWith('#')) return value;
  const known = (AVATAR_PALETTE_KEYS as readonly string[]).includes(value);
  return known ? ACCENTS[value as AccentKey].label : value;
}
