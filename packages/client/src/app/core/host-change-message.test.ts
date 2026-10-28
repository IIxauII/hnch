import { describe, it, expect } from 'vitest';
import { formatHostChangeMessage } from './host-change-message';

describe('formatHostChangeMessage', () => {
  it('formats disconnect with other peer promoted', () => {
    const message = formatHostChangeMessage({
      prevName: 'Alice',
      newName: 'Bob',
      isSelf: false,
      cause: 'disconnected',
    });
    expect(message).toBe('Alice disconnected. Bob is now the host.');
  });

  it('formats disconnect with self promoted', () => {
    const message = formatHostChangeMessage({
      prevName: 'Alice',
      newName: 'Carol',
      isSelf: true,
      cause: 'disconnected',
    });
    expect(message).toBe('Alice disconnected. You are now the host.');
  });

  it('formats initial assignment with other peer as host', () => {
    const message = formatHostChangeMessage({
      prevName: null,
      newName: 'Alice',
      isSelf: false,
    });
    expect(message).toBe('Alice is now the host');
  });

  it('formats initial assignment with self as host', () => {
    const message = formatHostChangeMessage({
      prevName: null,
      newName: 'Carol',
      isSelf: true,
    });
    expect(message).toBe('You are now the host');
  });

  it('says who left, when the host left the session', () => {
    expect(
      formatHostChangeMessage({ prevName: 'Alice', newName: 'Bob', isSelf: false, cause: 'left' }),
    ).toBe('Alice left. Bob is now the host.');
    expect(
      formatHostChangeMessage({ prevName: 'Alice', newName: 'Bob', isSelf: true, cause: 'left' }),
    ).toBe('Alice left. You are now the host.');
  });

  // The host that was is still in the session: they handed the role over,
  // or a peer that lost sight of the room elected itself. "Alice
  // disconnected." would be a false alarm, and "Alice made Bob the host." a
  // guess.
  it('gives no reason it cannot vouch for', () => {
    expect(
      formatHostChangeMessage({ prevName: 'Alice', newName: 'Bob', isSelf: false, cause: null }),
    ).toBe('Bob is now the host');
    expect(
      formatHostChangeMessage({ prevName: 'Alice', newName: 'Bob', isSelf: true, cause: null }),
    ).toBe('You are now the host');
    // Nor when it is not told one
    expect(formatHostChangeMessage({ prevName: 'Alice', newName: 'Bob', isSelf: false })).toBe(
      'Bob is now the host',
    );
  });

  it('tells the host that was only who the host is now', () => {
    for (const cause of ['left', 'disconnected', null] as const) {
      expect(
        formatHostChangeMessage({
          prevName: 'Alice',
          newName: 'Bob',
          isSelf: false,
          wasSelf: true,
          cause,
        }),
      ).toBe('Bob is now the host');
    }
  });

  it('gives no reason without a previous host, whatever the cause says', () => {
    expect(
      formatHostChangeMessage({ prevName: null, newName: 'Bob', isSelf: false, cause: 'left' }),
    ).toBe('Bob is now the host');
  });

  it('treats empty prevName as no prior host', () => {
    const message = formatHostChangeMessage({
      prevName: '',
      newName: 'Bob',
      isSelf: false,
    });
    expect(message).toBe('Bob is now the host');
  });
});
