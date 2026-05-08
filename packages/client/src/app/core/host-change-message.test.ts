import { describe, it, expect } from 'vitest';
import { formatHostChangeMessage } from './host-change-message';

describe('formatHostChangeMessage', () => {
  it('formats disconnect with other peer promoted', () => {
    const message = formatHostChangeMessage({
      prevName: 'Alice',
      newName: 'Bob',
      isSelf: false,
    });
    expect(message).toBe('Alice disconnected. Bob is now the host.');
  });

  it('formats disconnect with self promoted', () => {
    const message = formatHostChangeMessage({
      prevName: 'Alice',
      newName: 'Carol',
      isSelf: true,
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

  it('treats empty prevName as no prior host', () => {
    const message = formatHostChangeMessage({
      prevName: '',
      newName: 'Bob',
      isSelf: false,
    });
    expect(message).toBe('Bob is now the host');
  });
});
