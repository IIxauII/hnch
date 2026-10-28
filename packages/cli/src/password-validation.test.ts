import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH } from '@hnch/shared';
import { validatePassword } from './password-validation.js';

describe('validatePassword', () => {
  it('accepts an ordinary password and returns it normalized', () => {
    expect(validatePassword('secret123')).toEqual({ ok: true, password: 'secret123' });
  });

  it('refuses an empty string', () => {
    expect(validatePassword('')).toEqual({ ok: false, message: 'Password cannot be empty.' });
  });

  it('refuses whitespace-only input (blank after normalization)', () => {
    expect(validatePassword('   ')).toEqual({
      ok: false,
      message: 'Password cannot be empty.',
    });
  });

  it('refuses zero-width characters alone (blank after normalization)', () => {
    expect(validatePassword('​​')).toEqual({
      ok: false,
      message: 'Password cannot be empty.',
    });
  });

  it('trims surrounding whitespace on an otherwise valid password', () => {
    expect(validatePassword('  hunter2  ')).toEqual({ ok: true, password: 'hunter2' });
  });

  it('accepts a password exactly at MAX_PASSWORD_LENGTH', () => {
    const atLimit = 'a'.repeat(MAX_PASSWORD_LENGTH);
    expect(validatePassword(atLimit)).toEqual({ ok: true, password: atLimit });
  });

  it('refuses a password one character over MAX_PASSWORD_LENGTH', () => {
    const overLimit = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);
    expect(validatePassword(overLimit)).toEqual({
      ok: false,
      message: `Password is too long (at most ${MAX_PASSWORD_LENGTH} characters).`,
    });
  });

  it('does not count the whitespace around it', () => {
    const padded = ' ' + 'a'.repeat(MAX_PASSWORD_LENGTH) + ' ';
    expect(validatePassword(padded)).toEqual({
      ok: true,
      password: 'a'.repeat(MAX_PASSWORD_LENGTH),
    });
  });

  // The app's field counts what is typed into it. A few letters are written
  // out in NFC, so the form a password is compared in can be longer than the
  // password: one that fits the field has to pass here, or whoever set it
  // in the app has locked the terminal out.
  it('counts what was typed, not the form it is compared in', () => {
    const typed = '\u0958'.repeat(MAX_PASSWORD_LENGTH);
    const result = validatePassword(typed);

    expect(typed.normalize('NFC').length).toBeGreaterThan(MAX_PASSWORD_LENGTH);
    expect(result).toEqual({ ok: true, password: typed.normalize('NFC') });
  });
});
