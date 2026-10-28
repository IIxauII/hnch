// Exercises: refusal:watchForRefusal
// Exercises: refusal:refusalVerdict

import { describe, expect, it, vi } from 'vitest';
import { refusalVerdict, watchForRefusal } from './refusal.js';

describe('watchForRefusal', () => {
  it('has nothing to report while the relay has said nothing', () => {
    const watch = watchForRefusal();
    const unmount = vi.fn();

    watch.attach(unmount);

    expect(watch.refused()).toBeNull();
    expect(unmount).not.toHaveBeenCalled();
  });

  it('takes the UI down when the relay refuses the connection', () => {
    const watch = watchForRefusal();
    const unmount = vi.fn();
    watch.attach(unmount);

    watch.note('wrong-password');

    expect(watch.refused()).toBe('wrong-password');
    expect(unmount).toHaveBeenCalledOnce();
  });

  // The connection is made while the UI is still being put together. A relay
  // that is near answers first, and the refusal found nothing to take down:
  // the UI came up afterwards and sat there, connecting for ever.
  it('takes the UI down as soon as there is one, for a refusal that came before it', () => {
    const watch = watchForRefusal();
    const unmount = vi.fn();

    watch.note('room-full');
    expect(unmount).not.toHaveBeenCalled();
    watch.attach(unmount);

    expect(unmount).toHaveBeenCalledOnce();
    expect(watch.refused()).toBe('room-full');
  });
});

describe('refusalVerdict', () => {
  const atTheDoor = { roomCode: 'ABC123', wasIn: false, typedPassword: true };
  const inTheSession = { roomCode: 'ABC123', wasIn: true, typedPassword: false };

  it('a password typed just now and refused was typed wrong', () => {
    expect(refusalVerdict('wrong-password', atTheDoor)).toEqual({
      message: 'That password is incorrect.',
      exitCode: 1,
      remembered: 'forget-session',
    });
  });

  it('a password refused in the middle of the session has been changed', () => {
    expect(refusalVerdict('wrong-password', inTheSession)).toEqual({
      message: 'Password changed — rejoin with: hnch join ABC123 --password',
      exitCode: 0,
      remembered: 'forget-password',
    });
  });

  // `resume`: nothing was typed, the password is the one that was stored.
  it('so has one this device had stored', () => {
    expect(
      refusalVerdict('wrong-password', { roomCode: 'ABC123', wasIn: true, typedPassword: false }),
    ).toMatchObject({ exitCode: 0, remembered: 'forget-password' });
  });

  // Joined without one while the session was open; by the time the socket
  // was there, the host had set one.
  it('and one that was never asked for', () => {
    expect(
      refusalVerdict('wrong-password', { roomCode: 'ABC123', wasIn: false, typedPassword: false }),
    ).toMatchObject({
      message: 'Password changed — rejoin with: hnch join ABC123 --password',
      remembered: 'forget-password',
    });
  });

  it('a full room keeps its place for someone who was in it', () => {
    expect(refusalVerdict('room-full', inTheSession)).toEqual({
      message: 'This room is full (max 20 participants).',
      exitCode: 1,
      remembered: 'keep',
    });
  });

  it('and leaves nothing behind for someone who never got in', () => {
    expect(refusalVerdict('room-full', atTheDoor)).toMatchObject({
      exitCode: 1,
      remembered: 'forget-session',
    });
  });

  it('any other refusal ends the session too, and says which', () => {
    expect(refusalVerdict('malformed-credentials', inTheSession)).toEqual({
      message: 'The relay refused the connection (malformed-credentials).',
      exitCode: 1,
      remembered: 'keep',
    });
  });
});
