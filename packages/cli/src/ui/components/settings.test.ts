/**
 * Unit tests for CLI settings-related logic.
 *
 * Since Ink components require a TTY to render, these tests verify the
 * underlying logic by simulating the state transitions and callback
 * invocations that the components perform, without rendering to a terminal.
 *
 * Covered here:
 *   - TextInput key handler
 *   - Name submission (trim / blank → remove)
 *   - Scale selection (buildAvailableScales contract)
 *   - LobbySettings item-filter (host vs joiner)
 *   - CardPicker cursor navigation + select/clear
 *   - MenuList skip-disabled navigation
 *   - PresetEditor toggleCard (enable / disable / guard)
 *   - CustomScaleEditor save validation (name length, card count, dedup)
 */

import { describe, it, expect, vi } from 'vitest';
import { filterSettingsItems } from './LobbySettings.js';
import { buildAvailableScales } from '@hnch/shared';

// ── TextInput logic ──────────────────────────────────────────────────────────

/**
 * Simulates the key handler inside TextInput.
 * Returns the new value or invokes callbacks as the component would.
 */
function simulateTextInput(
  current: string,
  event: { char?: string; backspace?: boolean; return?: boolean; escape?: boolean },
  callbacks: {
    onChange: (v: string) => void;
    onSubmit: (v: string) => void;
    onCancel?: () => void;
  },
): void {
  if (event.escape) {
    callbacks.onCancel?.();
  } else if (event.return) {
    callbacks.onSubmit(current);
  } else if (event.backspace) {
    callbacks.onChange(current.slice(0, -1));
  } else if (event.char) {
    callbacks.onChange(current + event.char);
  }
}

describe('TextInput logic', () => {
  it('appends printable characters', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    simulateTextInput('he', { char: 'l' }, { onChange, onSubmit });
    expect(onChange).toHaveBeenCalledWith('hel');
  });

  it('backspace removes last character', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    simulateTextInput('hello', { backspace: true }, { onChange, onSubmit });
    expect(onChange).toHaveBeenCalledWith('hell');
  });

  it('backspace on empty string produces empty string', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    simulateTextInput('', { backspace: true }, { onChange, onSubmit });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('return calls onSubmit with current value', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    simulateTextInput('hello', { return: true }, { onChange, onSubmit });
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('return calls onSubmit with empty string', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    simulateTextInput('', { return: true }, { onChange, onSubmit });
    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it('escape calls onCancel', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    simulateTextInput('partial', { escape: true }, { onChange, onSubmit, onCancel });
    expect(onCancel).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('escape without onCancel does not throw', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    expect(() =>
      simulateTextInput('partial', { escape: true }, { onChange, onSubmit }),
    ).not.toThrow();
  });
});

// ── Name submission logic ────────────────────────────────────────────────────

/**
 * Simulates name submission logic:
 * empty/whitespace-only → undefined (remove), otherwise trimmed string.
 */
function resolveNameSubmit(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

describe('Name submission', () => {
  it('non-empty string is trimmed and returned', () => {
    expect(resolveNameSubmit('Sprint 42')).toBe('Sprint 42');
    expect(resolveNameSubmit('  Sprint 42  ')).toBe('Sprint 42');
  });

  it('empty string returns undefined (removes name)', () => {
    expect(resolveNameSubmit('')).toBeUndefined();
  });

  it('whitespace-only returns undefined', () => {
    expect(resolveNameSubmit('   ')).toBeUndefined();
  });
});

describe('Scale selection', () => {
  const scales = buildAvailableScales();

  it('buildAvailableScales returns all 5 builtins by default', () => {
    expect(scales).toHaveLength(5);
    expect(scales.map((s) => s.id)).toEqual([
      'fibonacci',
      't-shirt',
      'powers-of-2',
      'linear',
      'risk',
    ]);
  });

  it('no builtin scale contains sentinel cards', () => {
    for (const s of scales) {
      expect(s.cards).not.toContain('?');
      expect(s.cards).not.toContain('☕');
    }
  });

  it('scale cursor clamps to valid range', () => {
    const clamp = (c: number) => Math.max(0, Math.min(scales.length - 1, c));
    expect(clamp(-1)).toBe(0);
    expect(clamp(0)).toBe(0);
    expect(clamp(scales.length - 1)).toBe(scales.length - 1);
    expect(clamp(scales.length)).toBe(scales.length - 1);
  });

  it('buildAvailableScales appends custom scales after builtins', () => {
    const withCustom = buildAvailableScales({}, [
      { id: 'custom-team', label: 'Team', cards: ['S', 'M', 'L'] },
    ]);
    expect(withCustom).toHaveLength(6);
    expect(withCustom[5]!.id).toBe('custom-team');
  });

  it('buildAvailableScales applies preset overrides', () => {
    const withOverride = buildAvailableScales({ fibonacci: [0] }); // disable index 0
    const fib = withOverride.find((s) => s.id === 'fibonacci')!;
    expect(fib.cards).not.toContain('0');
    expect(fib.cards).toContain('1');
  });

  it('each builtin scale has at least 2 cards', () => {
    for (const s of scales) {
      expect(s.cards.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── LobbySettings item-filter logic (Phase 3: joiner read-only mode) ─────────

// Real production item set — matches allMenuItems in LobbySettings.tsx.
// Tests use the exported filterSettingsItems so production drift breaks tests.
const ALL_SETTINGS_ITEMS = [
  { label: 'Room name', value: 'room-name' },
  { label: 'Scale', value: 'scale' },
  { label: 'Access', value: 'access' },
  { label: 'Display name', value: 'display-name' },
] as const;

describe('filterSettingsItems (LobbySettings)', () => {
  it('host mode: all 4 items returned', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, true);
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.value)).toEqual(['room-name', 'scale', 'access', 'display-name']);
  });

  it('joiner mode: only display-name item present', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, false);
    expect(items).toHaveLength(1);
    expect(items[0]!.value).toBe('display-name');
    expect(items[0]!.label).toBe('Display name');
  });

  it('joiner mode: room-name item absent', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, false);
    expect(items.find((i) => i.value === 'room-name')).toBeUndefined();
  });

  it('joiner mode: scale item absent', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, false);
    expect(items.find((i) => i.value === 'scale')).toBeUndefined();
  });

  it('joiner mode: access item absent', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, false);
    expect(items.find((i) => i.value === 'access')).toBeUndefined();
  });
});

// ── CardPicker navigation logic ───────────────────────────────────────────────

/**
 * Simulates the cursor-movement logic from CardPicker.tsx's useInput handler.
 * leftArrow: Math.max(0, c - 1)
 * rightArrow: Math.min(cards.length - 1, c + 1)
 */
function cardPickerNav(cards: string[], cursor: number, dir: 'left' | 'right'): number {
  if (dir === 'left') return Math.max(0, cursor - 1);
  return Math.min(cards.length - 1, cursor + 1);
}

/**
 * Simulates the Enter-key action from CardPicker: select or clear.
 */
function cardPickerSelect(
  cards: string[],
  cursor: number,
  selected: string | undefined,
  callbacks: { onSelect: (card: string) => void; onClear: () => void },
): void {
  const card = cards[cursor]!;
  if (card === selected) {
    callbacks.onClear();
  } else {
    callbacks.onSelect(card);
  }
}

describe('CardPicker — cursor navigation', () => {
  const CARDS = ['1', '2', '3', '5', '8', '13'];

  it('right arrow advances cursor', () => {
    expect(cardPickerNav(CARDS, 0, 'right')).toBe(1);
    expect(cardPickerNav(CARDS, 2, 'right')).toBe(3);
  });

  it('right arrow clamps at last card', () => {
    expect(cardPickerNav(CARDS, CARDS.length - 1, 'right')).toBe(CARDS.length - 1);
  });

  it('left arrow moves cursor back', () => {
    expect(cardPickerNav(CARDS, 3, 'left')).toBe(2);
  });

  it('left arrow clamps at first card', () => {
    expect(cardPickerNav(CARDS, 0, 'left')).toBe(0);
  });
});

describe('CardPicker — select / clear', () => {
  const CARDS = ['1', '2', '3', '5'];

  it('Enter on unselected card calls onSelect with that card', () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    cardPickerSelect(CARDS, 2, undefined, { onSelect, onClear });
    expect(onSelect).toHaveBeenCalledWith('3');
    expect(onClear).not.toHaveBeenCalled();
  });

  it('Enter on already-selected card calls onClear', () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    cardPickerSelect(CARDS, 1, '2', { onSelect, onClear });
    expect(onClear).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Enter on a different card calls onSelect, not onClear', () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    cardPickerSelect(CARDS, 3, '2', { onSelect, onClear });
    expect(onSelect).toHaveBeenCalledWith('5');
    expect(onClear).not.toHaveBeenCalled();
  });
});

// ── MenuList skip-disabled navigation logic ───────────────────────────────────

interface SimpleMenuItem {
  value: string;
  disabled?: boolean;
}

/**
 * Simulates the downArrow handler from MenuList.tsx.
 * Skips disabled items, wraps around.
 */
function menuNavDown(items: SimpleMenuItem[], cursor: number): number {
  let next = (cursor + 1) % items.length;
  let attempts = 0;
  while (items[next]?.disabled && attempts < items.length) {
    next = (next + 1) % items.length;
    attempts++;
  }
  return next;
}

/**
 * Simulates the upArrow handler from MenuList.tsx.
 * Skips disabled items, wraps around.
 */
function menuNavUp(items: SimpleMenuItem[], cursor: number): number {
  let next = (cursor - 1 + items.length) % items.length;
  let attempts = 0;
  while (items[next]?.disabled && attempts < items.length) {
    next = (next - 1 + items.length) % items.length;
    attempts++;
  }
  return next;
}

describe('MenuList — skip-disabled navigation', () => {
  it('down moves to next item when all enabled', () => {
    const items: SimpleMenuItem[] = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
    expect(menuNavDown(items, 0)).toBe(1);
    expect(menuNavDown(items, 1)).toBe(2);
  });

  it('down wraps from last to first', () => {
    const items: SimpleMenuItem[] = [{ value: 'a' }, { value: 'b' }];
    expect(menuNavDown(items, 1)).toBe(0);
  });

  it('down skips a disabled item in the middle', () => {
    const items: SimpleMenuItem[] = [
      { value: 'a' },
      { value: 'b', disabled: true },
      { value: 'c' },
    ];
    expect(menuNavDown(items, 0)).toBe(2);
  });

  it('down skips consecutive disabled items', () => {
    const items: SimpleMenuItem[] = [
      { value: 'a' },
      { value: 'b', disabled: true },
      { value: 'c', disabled: true },
      { value: 'd' },
    ];
    expect(menuNavDown(items, 0)).toBe(3);
  });

  it('up moves to previous item when all enabled', () => {
    const items: SimpleMenuItem[] = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
    expect(menuNavUp(items, 2)).toBe(1);
    expect(menuNavUp(items, 1)).toBe(0);
  });

  it('up wraps from first to last', () => {
    const items: SimpleMenuItem[] = [{ value: 'a' }, { value: 'b' }];
    expect(menuNavUp(items, 0)).toBe(1);
  });

  it('up skips a disabled item', () => {
    const items: SimpleMenuItem[] = [
      { value: 'a' },
      { value: 'b', disabled: true },
      { value: 'c' },
    ];
    expect(menuNavUp(items, 2)).toBe(0);
  });

  it('up wraps around disabled items at the boundary', () => {
    const items: SimpleMenuItem[] = [
      { value: 'a' },
      { value: 'b', disabled: true },
      { value: 'c' },
    ];
    // From 'a' going up should wrap and skip 'b' (disabled) → land on 'c'
    expect(menuNavUp(items, 0)).toBe(2);
  });
});

// ── PresetEditor toggleCard logic ─────────────────────────────────────────────

/**
 * Simulates the toggleCard function from PresetEditor.tsx.
 * Returns the new sorted disabledIndices array, or null if the guard
 * prevented the action (all-but-one already disabled).
 */
function simulateToggleCard(
  cards: string[],
  currentDisabled: number[],
  index: number,
): number[] | null {
  const disabled = new Set(currentDisabled);
  if (disabled.has(index)) {
    disabled.delete(index);
  } else {
    if (disabled.size >= cards.length - 1) {
      return null; // guard fired — caller must not call onOverrideChange
    }
    disabled.add(index);
  }
  return Array.from(disabled).toSorted((a, b) => a - b);
}

describe('PresetEditor — toggleCard', () => {
  const CARDS = ['1', '2', '3', '5', '8'];

  it('disables a card that is currently enabled', () => {
    expect(simulateToggleCard(CARDS, [], 2)).toEqual([2]);
  });

  it('re-enables a card that is currently disabled', () => {
    expect(simulateToggleCard(CARDS, [2], 2)).toEqual([]);
  });

  it('disables a second card (adds to existing set)', () => {
    expect(simulateToggleCard(CARDS, [1], 3)).toEqual([1, 3]);
  });

  it('result indices are always sorted ascending', () => {
    expect(simulateToggleCard(CARDS, [3], 1)).toEqual([1, 3]);
  });

  it('guard fires when all-but-one card is already disabled', () => {
    // 5 cards → max 4 disabled; trying to disable the 5th must return null
    const result = simulateToggleCard(CARDS, [0, 1, 2, 3], 4);
    expect(result).toBeNull();
  });

  it('guard does NOT fire when one more slot is still available', () => {
    // 5 cards, 3 disabled → disabling a 4th is still allowed
    const result = simulateToggleCard(CARDS, [0, 1, 2], 3);
    expect(result).not.toBeNull();
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('re-enabling when fully-guarded still works (reduces disabled count)', () => {
    // 4 disabled; re-enabling one should succeed
    expect(simulateToggleCard(CARDS, [0, 1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
});

// ── CustomScaleEditor save/validation logic ───────────────────────────────────

type SaveResult = { valid: true; name: string; cards: string[] } | { valid: false; error: string };

/**
 * Simulates the handleSave logic from CustomScaleEditor.tsx:
 *   - name must be 1-40 chars (after trim)
 *   - cards are trimmed, empties dropped, duplicates removed
 *   - need at least 2 unique non-empty cards
 */
function simulateCustomScaleSave(name: string, cards: string[]): SaveResult {
  const trimmedName = name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 40) {
    return { valid: false, error: 'Name must be 1-40 characters' };
  }
  const trimmedCards = cards.map((c) => c.trim()).filter((c) => c.length > 0);
  const uniqueCards = Array.from(new Set(trimmedCards));
  if (uniqueCards.length < 2) {
    return { valid: false, error: 'Need at least 2 unique non-empty cards' };
  }
  return { valid: true, name: trimmedName, cards: uniqueCards };
}

describe('CustomScaleEditor — save validation', () => {
  it('valid name and 2+ cards saves successfully', () => {
    const result = simulateCustomScaleSave('Team Sizes', ['XS', 'S', 'M', 'L']);
    expect(result).toEqual({ valid: true, name: 'Team Sizes', cards: ['XS', 'S', 'M', 'L'] });
  });

  it('trims whitespace from the name', () => {
    const result = simulateCustomScaleSave('  Sprint  ', ['1', '2']);
    expect(result).toEqual({ valid: true, name: 'Sprint', cards: ['1', '2'] });
  });

  it('rejects an empty name', () => {
    const result = simulateCustomScaleSave('', ['1', '2', '3']);
    expect(result).toEqual({ valid: false, error: 'Name must be 1-40 characters' });
  });

  it('rejects a whitespace-only name', () => {
    const result = simulateCustomScaleSave('   ', ['1', '2', '3']);
    expect(result).toEqual({ valid: false, error: 'Name must be 1-40 characters' });
  });

  it('rejects a name longer than 40 characters', () => {
    const result = simulateCustomScaleSave('A'.repeat(41), ['1', '2']);
    expect(result).toEqual({ valid: false, error: 'Name must be 1-40 characters' });
  });

  it('accepts a name exactly 40 characters long', () => {
    const result = simulateCustomScaleSave('A'.repeat(40), ['1', '2']);
    expect(result).toMatchObject({ valid: true, name: 'A'.repeat(40) });
  });

  it('rejects fewer than 2 unique cards', () => {
    const result = simulateCustomScaleSave('My Scale', ['1']);
    expect(result).toEqual({ valid: false, error: 'Need at least 2 unique non-empty cards' });
  });

  it('rejects 0 cards', () => {
    const result = simulateCustomScaleSave('My Scale', []);
    expect(result).toEqual({ valid: false, error: 'Need at least 2 unique non-empty cards' });
  });

  it('deduplicates cards and validates after dedup', () => {
    // Two identical cards → only 1 unique → should fail
    const result = simulateCustomScaleSave('My Scale', ['1', '1']);
    expect(result).toEqual({ valid: false, error: 'Need at least 2 unique non-empty cards' });
  });

  it('filters out empty / whitespace-only card values', () => {
    // Two real cards + one empty → should pass with 2 cards
    const result = simulateCustomScaleSave('My Scale', ['1', '', '2']);
    expect(result).toEqual({ valid: true, name: 'My Scale', cards: ['1', '2'] });
  });

  it('trims whitespace from card values before dedup', () => {
    // ' 1 ' and '1' are the same after trim → 1 unique card
    const result = simulateCustomScaleSave('My Scale', [' 1 ', '1']);
    expect(result).toEqual({ valid: false, error: 'Need at least 2 unique non-empty cards' });
  });

  it('preserves insertion order for unique cards', () => {
    const result = simulateCustomScaleSave('My Scale', ['XL', 'M', 'S', 'XL']);
    expect(result).toMatchObject({ valid: true, cards: ['XL', 'M', 'S'] });
  });
});
