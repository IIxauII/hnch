/**
 * Render tests covering the custom-scale label resolution path in the
 * three CLI surfaces: ConfigSettings (default-scale row), LobbySettings
 * (in-session settings), and ScalePicker (browseable list).
 *
 * These mount the components with `ink-testing-library` and assert the
 * user-supplied `CustomScale.label` appears in the output rather than
 * the formatted UUID. They exercise the `getScaleLabel(id, customs)`
 * call sites that swap-only unit tests cannot reach.
 */

import { render } from 'ink-testing-library';
import { press, renderInk } from '../test-harness.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomScale, Scale } from '@hnch/shared';

import { LobbySettings } from './LobbySettings.js';
import { ScalePicker } from './ScalePicker.js';

const CUSTOM: CustomScale = {
  id: 'custom-bananas',
  label: 'Team Bananas',
  cards: ['1', '2', '3'],
};
const CUSTOM_SCALE: Scale = { id: CUSTOM.id, cards: CUSTOM.cards };

const noop = (): void => {};
const noopAsync = async (): Promise<void> => {};

describe('LobbySettings — custom scale label rendering', () => {
  it('Scale row detail shows the custom label, not the id', () => {
    const { lastFrame } = render(
      <LobbySettings
        sessionName="Session"
        displayName="Host"
        currentScale={CUSTOM_SCALE}
        accessMode="open"
        customScales={[CUSTOM]}
        onChangeName={noop}
        onChangeScale={noop}
        onChangeDisplayName={noop}
        onChangeAccess={noopAsync}
        onClose={noop}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Team Bananas');
    expect(frame).not.toContain('custom-bananas');
  });

  it('falls back to the formatted id when the custom scale has no label', () => {
    const blank: CustomScale = { id: 'custom-no-label', label: '', cards: ['1', '2'] };
    const { lastFrame } = render(
      <LobbySettings
        sessionName="Session"
        displayName="Host"
        currentScale={{ id: blank.id, cards: blank.cards }}
        accessMode="open"
        customScales={[blank]}
        onChangeName={noop}
        onChangeScale={noop}
        onChangeDisplayName={noop}
        onChangeAccess={noopAsync}
        onClose={noop}
      />,
    );
    expect(lastFrame()).toContain('No Label');
  });
});

describe('ScalePicker — custom scale label rendering', () => {
  it('lists the custom scale by its label', () => {
    const { lastFrame } = render(
      <ScalePicker
        scales={[CUSTOM_SCALE]}
        selectedScaleId={CUSTOM.id}
        customScales={[CUSTOM]}
        onSelect={noop}
        onOverrideChange={noop}
        onClose={noop}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Team Bananas');
    expect(frame).not.toContain('custom-bananas');
  });

  it('falls back to formatted id when the custom label is blank', () => {
    const blank: CustomScale = { id: 'custom-no-label', label: '', cards: ['1'] };
    const { lastFrame } = render(
      <ScalePicker
        scales={[{ id: blank.id, cards: blank.cards }]}
        selectedScaleId={blank.id}
        customScales={[blank]}
        onSelect={noop}
        onOverrideChange={noop}
        onClose={noop}
      />,
    );
    expect(lastFrame()).toContain('No Label');
  });

  it('delete-confirm prompt names the custom scale by its label', async () => {
    const { lastFrame, stdin, rerender } = await renderInk(
      <ScalePicker
        scales={[CUSTOM_SCALE]}
        selectedScaleId={CUSTOM.id}
        customScales={[CUSTOM]}
        onSelect={noop}
        onOverrideChange={noop}
        onCustomScaleDelete={noop}
        onClose={noop}
      />,
    );
    await press(stdin, 'd');
    rerender(
      <ScalePicker
        scales={[CUSTOM_SCALE]}
        selectedScaleId={CUSTOM.id}
        customScales={[CUSTOM]}
        onSelect={noop}
        onOverrideChange={noop}
        onCustomScaleDelete={noop}
        onClose={noop}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Delete Team Bananas?');
  });
});

// ---------------------------------------------------------------------------
// ConfigSettings — needs config.ts mocked so readConfig() does not touch disk
// ---------------------------------------------------------------------------

vi.mock('../../config.js', () => ({
  readConfig: () => ({
    displayName: 'Host',
    relayUrl: 'wss://relay.example/ws',
    defaultScale: 'custom-bananas',
  }),
  writeConfig: () => {},
  updateConfig: () => {},
}));

// Imported AFTER the mock declaration; vi.mock is hoisted but the import must
// follow so the mocked module is in the dependency graph.
const { ConfigSettings } = await import('./ConfigSettings.js');

describe('ConfigSettings — custom scale label rendering', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Default scale detail shows the custom label, not the id', () => {
    const { lastFrame } = render(<ConfigSettings customScales={[CUSTOM]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Team Bananas');
    expect(frame).not.toContain('custom-bananas');
  });

  it('Default scale detail shows (none) when the configured id matches no scale', async () => {
    // Replace the readConfig mock so currentScaleObj resolves to undefined and
    // the ternary's `(none)` branch renders. vi.doMock requires re-importing
    // the module under test inside the same `it` so it picks up the change.
    vi.doMock('../../config.js', () => ({
      readConfig: () => ({ defaultScale: 'custom-missing' }),
      writeConfig: () => {},
      updateConfig: () => {},
    }));
    vi.resetModules();
    const { ConfigSettings: Fresh } = await import('./ConfigSettings.js');
    const { lastFrame } = render(<Fresh customScales={[]} />);
    expect(lastFrame()).toContain('(none)');
  });
});
