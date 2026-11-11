/**
 * The in-session settings' access entry: only the host can change a room's
 * access (ADR-0059), so only the host is offered it, and a refusal from the
 * relay reads as a sentence.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scale } from '@hnch/shared';
import { press, renderInk } from '../test-harness.js';
import { LobbySettings } from './LobbySettings.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3'] };
const DOWN = '\u001B[B';
const LEFT = '\u001B[D';
const ENTER = '\r';

const noop = (): void => {};

function settings(props: {
  isHost: boolean;
  onChangeAccess?: (mode: 'open' | 'password', password?: string) => Promise<void>;
}): React.ReactElement {
  return (
    <LobbySettings
      sessionName="Session"
      displayName="Host"
      currentScale={SCALE}
      accessMode="password"
      isHost={props.isHost}
      onChangeName={noop}
      onChangeScale={noop}
      onChangeDisplayName={noop}
      onChangeAccess={props.onChangeAccess ?? (async () => {})}
      onClose={noop}
    />
  );
}

/** Menu: Room name, Scale, Access, Display name. */
async function openAccessPicker(stdin: Parameters<typeof press>[0]): Promise<void> {
  await press(stdin, DOWN);
  await press(stdin, DOWN);
  await press(stdin, ENTER);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LobbySettings — access is the host’s (ADR-0059)', () => {
  it('offers a participant who is not the host no access entry', async () => {
    const { lastFrame } = await renderInk(settings({ isHost: false }));
    expect(lastFrame()).not.toContain('Access');
    expect(lastFrame()).toContain('Display name');
  });

  it('closes the access picker when the host role is lost while it is open', async () => {
    const { stdin, lastFrame, rerender } = await renderInk(settings({ isHost: true }));
    await openAccessPicker(stdin);
    expect(lastFrame()).toContain('Password');

    rerender(settings({ isHost: false }));
    await press(stdin, '');

    expect(lastFrame()).not.toContain('[Password]');
    expect(lastFrame()).not.toContain('Access');
    expect(lastFrame()).toContain('Display name');
  });

  it('prints the relay’s refusal as a sentence', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onChangeAccess = vi
      .fn()
      .mockRejectedValue(new Error('Only the host can change the password'));
    const { stdin } = await renderInk(settings({ isHost: true, onChangeAccess }));
    await openAccessPicker(stdin);

    // From Password to Open: the change the relay refuses.
    await press(stdin, LEFT);
    await press(stdin, ENTER);

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to update access: Only the host can change the password',
      ),
    );
    expect(onChangeAccess).toHaveBeenCalledWith('open', undefined);
  });
});
