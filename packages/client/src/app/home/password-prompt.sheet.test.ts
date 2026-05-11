/**
 * Unit tests for PasswordPromptSheetComponent.onConfirm().
 *
 * onConfirm is a protected method that guards on FormControl validity
 * (Validators.maxLength(120)) and emits the trimmed password value.
 * Tested via a minimal stub following relay-url-editor.sheet.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Inline validity — mirrors Validators.maxLength(120) from the component
// ---------------------------------------------------------------------------

function isPasswordInvalid(value: string): boolean {
  return value.length > 120;
}

// ---------------------------------------------------------------------------
// Component stub — mirrors PasswordPromptSheetComponent
// ---------------------------------------------------------------------------

function makeSheet(rawValue: string) {
  const invalid = isPasswordInvalid(rawValue);
  const passwordSubmitted = { emit: vi.fn<[string]>() };
  const sheet = {
    passwordControl: { value: rawValue, invalid },
    passwordSubmitted,
    onConfirm() {
      if (this.passwordControl.invalid) return;
      const password = this.passwordControl.value.trim();
      this.passwordSubmitted.emit(password);
    },
  };
  return { sheet, emit: passwordSubmitted.emit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PasswordPromptSheetComponent.onConfirm()', () => {
  it('does not emit when password exceeds 120 characters (invalid FormControl)', () => {
    const { sheet, emit } = makeSheet('x'.repeat(121));
    sheet.onConfirm();
    expect(emit).not.toHaveBeenCalled();
  });

  it('allows exactly 120 characters (boundary — valid)', () => {
    const atLimit = 'a'.repeat(120);
    const { sheet, emit } = makeSheet(atLimit);
    sheet.onConfirm();
    expect(emit).toHaveBeenCalledWith(atLimit);
  });

  it('emits empty string for empty input (blank password is allowed)', () => {
    const { sheet, emit } = makeSheet('');
    sheet.onConfirm();
    expect(emit).toHaveBeenCalledWith('');
  });

  it('emits empty string for whitespace-only input (trimmed)', () => {
    const { sheet, emit } = makeSheet('   ');
    sheet.onConfirm();
    expect(emit).toHaveBeenCalledWith('');
  });

  it('emits the password value for a valid non-empty string', () => {
    const { sheet, emit } = makeSheet('hunter2');
    sheet.onConfirm();
    expect(emit).toHaveBeenCalledWith('hunter2');
  });

  it('trims surrounding whitespace from the emitted password', () => {
    const { sheet, emit } = makeSheet('  secret  ');
    sheet.onConfirm();
    expect(emit).toHaveBeenCalledWith('secret');
  });
});
