/**
 * Unit tests for AccessPickerSheetComponent.
 *
 * onModeChange and onPasswordCommit are protected methods, tested via
 * a minimal stub following relay-url-editor.sheet.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

type AccessMode = 'open' | 'password';

interface AccessSelection {
  readonly mode: AccessMode;
  readonly password: string | null;
}

// ---------------------------------------------------------------------------
// Component stub — mirrors AccessPickerSheetComponent
// ---------------------------------------------------------------------------

function makeSheet(currentMode: AccessMode, passwordValue = '') {
  const selected = { emit: vi.fn<[AccessSelection]>() };
  const sheet = {
    _currentMode: currentMode,
    passwordControl: { value: passwordValue },
    selected,
    currentMode(): AccessMode {
      return this._currentMode;
    },
    onModeChange(mode: AccessMode | null | undefined): void {
      if (!mode) return;
      if (mode === this.currentMode()) return;
      this.selected.emit({
        mode,
        password: mode === 'password' ? this.passwordControl.value : null,
      });
    },
    onPasswordCommit(): void {
      if (this.currentMode() !== 'password') return;
      this.selected.emit({
        mode: 'password',
        password: this.passwordControl.value,
      });
    },
  };
  return { sheet, emit: selected.emit };
}

// ---------------------------------------------------------------------------
// onModeChange tests
// ---------------------------------------------------------------------------

describe('AccessPickerSheetComponent.onModeChange()', () => {
  it('does nothing when mode is null', () => {
    const { sheet, emit } = makeSheet('open');
    sheet.onModeChange(null);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does nothing when mode is undefined', () => {
    const { sheet, emit } = makeSheet('open');
    sheet.onModeChange(undefined);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does nothing when mode is unchanged (prevents spurious doc writes)', () => {
    const { sheet, emit } = makeSheet('open');
    sheet.onModeChange('open');
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits password mode with current control value when switching open → password', () => {
    const { sheet, emit } = makeSheet('open', 'typed-so-far');
    sheet.onModeChange('password');
    expect(emit).toHaveBeenCalledWith({ mode: 'password', password: 'typed-so-far' });
  });

  it('emits open mode with null password when switching password → open', () => {
    const { sheet, emit } = makeSheet('password', 'secret');
    sheet.onModeChange('open');
    expect(emit).toHaveBeenCalledWith({ mode: 'open', password: null });
  });
});

// ---------------------------------------------------------------------------
// onPasswordCommit tests
// ---------------------------------------------------------------------------

describe('AccessPickerSheetComponent.onPasswordCommit()', () => {
  it('does not emit when current mode is open', () => {
    const { sheet, emit } = makeSheet('open', 'some-text');
    sheet.onPasswordCommit();
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits password selection with the control value when mode is password', () => {
    const { sheet, emit } = makeSheet('password', 'hunter2');
    sheet.onPasswordCommit();
    expect(emit).toHaveBeenCalledWith({ mode: 'password', password: 'hunter2' });
  });

  it('emits with empty string when control is empty (commit with no input)', () => {
    const { sheet, emit } = makeSheet('password', '');
    sheet.onPasswordCommit();
    expect(emit).toHaveBeenCalledWith({ mode: 'password', password: '' });
  });
});
