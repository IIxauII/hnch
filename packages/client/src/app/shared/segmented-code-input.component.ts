import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  forwardRef,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const TILE_COUNT = 6;

/**
 * Segmented 6-char code input — ControlValueAccessor.
 *
 * Renders 7 tiles: 6 character tiles + 1 separator in position 3.
 * - Paste: distributes across tiles, uppercase, strips non-alphanumeric.
 * - Backspace on empty tile: focuses previous tile.
 * - Char input: focuses next tile.
 * - Form value: always `XXXXXX` (no separator).
 * - writeValue: accepts `XXXXXX` or `XXX-XXX` or `XXX XXX`.
 *
 * Reuse target: join.page.ts IonInput swap (#2).
 *
 * See ionic-screens.jsx:380–391.
 */
@Component({
  selector: 'app-segmented-code-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SegmentedCodeInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="code-row" role="group" aria-label="Session code, 6 characters">
      @for (tile of tiles(); track $index) {
        @if ($index === 3) {
          <span class="separator" aria-hidden="true"></span>
        }
        <input
          #tileInput
          class="tile"
          [class.focused]="focusedIndex() === $index"
          type="text"
          inputmode="text"
          maxlength="1"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="characters"
          spellcheck="false"
          [value]="tiles()[$index]"
          [disabled]="isDisabled()"
          [attr.aria-label]="'Character ' + ($index + 1) + ' of 6'"
          [attr.aria-required]="true"
          (focus)="onFocus($index, $event)"
          (click)="selectTile($event)"
          (blur)="onBlur()"
          (keydown)="onKeyDown($event, $index)"
          (input)="onInput($event, $index)"
          (paste)="onPaste($event, $index)"
        />
      }
    </div>
  `,
  styles: [
    `
    :host {
      display: block;
    }

    .code-row {
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: 360px;
      margin-inline: auto;
    }

    .tile {
      flex: 1 1 0;
      min-width: 0;
      height: 52px;
      padding: 0;
      border-radius: 10px;
      background: var(--hnch-fill);
      border: 1.5px solid transparent;
      outline: none;
      text-align: center;
      font-family: ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace;
      /* Never below 16px: iOS zooms the page when a smaller input takes focus. */
      font-size: clamp(20px, 7vw, 26px);
      font-weight: 600;
      color: var(--hnch-text);
      text-transform: uppercase;
      caret-color: transparent;
      transition: border-color 0.15s ease, background 0.15s ease;
      -webkit-appearance: none;
      appearance: none;
    }

    .tile.focused,
    .tile:focus {
      border-color: var(--hnch-accent-text);
      background: var(--hnch-elev-1);
    }

    /* The character of the tile that has the focus is selected, so that the
       next one typed replaces it. The border says which tile that is; a
       highlight behind the character would say it a second time. */
    .tile::selection {
      background: transparent;
      color: inherit;
    }

    .tile:disabled {
      opacity: 0.5;
    }

    @media (prefers-reduced-motion: reduce) {
      .tile {
        transition: none;
      }
    }

    .separator {
      flex: 0 0 8px;
      height: 2px;
      background: var(--hnch-muted-2);
      border-radius: 1px;
    }
  `,
  ],
})
export class SegmentedCodeInputComponent implements ControlValueAccessor {
  @ViewChildren('tileInput') tileInputs!: QueryList<ElementRef<HTMLInputElement>>;

  protected readonly tiles = signal<string[]>(Array(TILE_COUNT).fill(''));
  protected readonly focusedIndex = signal<number>(-1);
  protected readonly isDisabled = signal<boolean>(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  // ControlValueAccessor

  writeValue(value: string | null | undefined): void {
    if (!value) {
      this.tiles.set(Array(TILE_COUNT).fill(''));
      return;
    }
    // Normalize: strip non-alphanumeric, uppercase, take first 6 chars
    const clean = value
      .replaceAll(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, TILE_COUNT);
    this.tiles.set(Array.from({ length: TILE_COUNT }, (_, i) => clean[i] ?? ''));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);
  }

  /** Move focus to the first empty tile, or the last one when all are filled. */
  focus(): void {
    const firstEmpty = this.tiles().findIndex((t) => t === '');
    this.focusTile(firstEmpty === -1 ? TILE_COUNT - 1 : firstEmpty);
  }

  // Event handlers

  protected onFocus(index: number, event?: Event): void {
    this.focusedIndex.set(index);
    if (event !== undefined) this.selectTile(event);
  }

  /**
   * A tile holds one character, and a tile that holds one takes no second:
   * typing into it did nothing at all. With its character selected, the
   * next one typed takes its place — from a keyboard on screen too, which
   * sends no keys to go by. On a click as well as on focus: the click puts
   * the cursor down again after the focus has selected.
   */
  protected selectTile(event: Event): void {
    const tile = event.target;
    if (tile instanceof HTMLInputElement) tile.select();
  }

  protected onBlur(): void {
    this.focusedIndex.set(-1);
    this.onTouched();
  }

  protected onKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      if (this.tiles()[index] === '') {
        // Move to previous tile
        if (index > 0) {
          this.focusTile(index - 1);
        }
      } else {
        this.setTile(index, '');
        this.emitChange();
      }
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.focusTile(index - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowRight' && index < TILE_COUNT - 1) {
      this.focusTile(index + 1);
      event.preventDefault();
    } else if (this.tiles()[index] !== '' && isCodeCharacter(event)) {
      // Typed over: a wrong character is corrected by typing the right one,
      // whether or not the one that is there is still selected.
      this.setTile(index, event.key.toUpperCase());
      this.emitChange();
      if (index < TILE_COUNT - 1) this.focusTile(index + 1);
      event.preventDefault();
    }
  }

  protected onInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    const clean = raw.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (clean.length <= 1) {
      // Single char — normal flow
      this.setTile(index, clean);
      // Sync native value to single clean char
      input.value = clean;
      this.emitChange();
      if (clean && index < TILE_COUNT - 1) {
        this.focusTile(index + 1);
      }
    } else {
      // Multi-char (iOS SMS autofill / IME) — distribute like paste
      let charIdx = 0;
      for (let i = index; i < TILE_COUNT && charIdx < clean.length; i++, charIdx++) {
        this.setTile(i, clean[charIdx] ?? '');
      }
      this.emitChange();
      const lastFilled = Math.min(index + clean.length - 1, TILE_COUNT - 1);
      const nextFocus = Math.min(lastFilled + 1, TILE_COUNT - 1);
      this.focusTile(nextFocus);
    }
  }

  protected onPaste(event: ClipboardEvent, startIndex: number): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') ?? '';
    const clean = pasted.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase();

    let charIdx = 0;
    for (let i = startIndex; i < TILE_COUNT && charIdx < clean.length; i++, charIdx++) {
      this.setTile(i, clean[charIdx] ?? '');
    }
    this.emitChange();
    this.onTouched();

    // Focus last filled tile or the tile after
    const lastFilled = Math.min(startIndex + clean.length - 1, TILE_COUNT - 1);
    const nextFocus = Math.min(lastFilled + 1, TILE_COUNT - 1);
    this.focusTile(nextFocus);
  }

  // Private helpers

  private setTile(index: number, char: string): void {
    this.tiles.update((prev) => prev.map((t, i) => (i === index ? char : t)));
  }

  private emitChange(): void {
    const value = this.tiles().join('');
    this.onChange(value);
  }

  private focusTile(index: number): void {
    const inputs = this.tileInputs?.toArray();
    if (inputs?.[index]) {
      inputs[index].nativeElement.focus();
      this.focusedIndex.set(index);
    }
  }
}

/** True for a key that types a character a code can have — not a shortcut that happens to use one. */
function isCodeCharacter(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return /^[a-zA-Z0-9]$/u.test(event.key);
}
