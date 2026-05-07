import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  forwardRef,
  signal,
} from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'

const TILE_COUNT = 6

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
 * Reuse target: join.page.ts IonInput swap (issue #2).
 *
 * See ionic-screens.jsx:380–391.
 */
@Component({
  selector: 'app-segmented-code-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SegmentedCodeInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="code-row" role="group" aria-label="Room code, 6 characters">
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
          (focus)="onFocus($index)"
          (blur)="onBlur()"
          (keydown)="onKeyDown($event, $index)"
          (input)="onInput($event, $index)"
          (paste)="onPaste($event, $index)"
        />
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .code-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tile {
      flex: 1;
      height: 48px;
      border-radius: 10px;
      background: var(--ion-background-color-step-100);
      border: 1.5px solid transparent;
      outline: none;
      text-align: center;
      font-family: 'SF Mono', 'Fira Mono', 'Roboto Mono', monospace;
      font-size: 26px;
      font-weight: 600;
      color: var(--ion-text-color);
      text-transform: uppercase;
      caret-color: transparent;
      transition: border-color 0.15s ease;
      -webkit-appearance: none;
      appearance: none;
    }

    .tile.focused,
    .tile:focus {
      border-color: var(--hnch-accent);
    }

    .separator {
      flex: 0 0 8px;
      height: 2px;
      background: var(--ion-color-step-400);
      border-radius: 1px;
    }
  `],
})
export class SegmentedCodeInputComponent implements ControlValueAccessor {
  @ViewChildren('tileInput') tileInputs!: QueryList<ElementRef<HTMLInputElement>>

  protected readonly tiles = signal<string[]>(Array(TILE_COUNT).fill(''))
  protected readonly focusedIndex = signal<number>(-1)
  protected readonly isDisabled = signal<boolean>(false)

  private onChange: (value: string) => void = () => {}
  private onTouched: () => void = () => {}

  // ControlValueAccessor -------------------------------------------------

  writeValue(value: string | null | undefined): void {
    if (!value) {
      this.tiles.set(Array(TILE_COUNT).fill(''))
      return
    }
    // Normalize: strip non-alphanumeric, uppercase, take first 6 chars
    const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, TILE_COUNT)
    this.tiles.set(Array.from({ length: TILE_COUNT }, (_, i) => clean[i] ?? ''))
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled)
  }

  // Event handlers -------------------------------------------------------

  protected onFocus(index: number): void {
    this.focusedIndex.set(index)
  }

  protected onBlur(): void {
    this.focusedIndex.set(-1)
    this.onTouched()
  }

  protected onKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      if (this.tiles()[index] === '') {
        // Move to previous tile
        if (index > 0) {
          this.focusTile(index - 1)
        }
      } else {
        this.setTile(index, '')
        this.emitChange()
      }
      event.preventDefault()
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.focusTile(index - 1)
      event.preventDefault()
    } else if (event.key === 'ArrowRight' && index < TILE_COUNT - 1) {
      this.focusTile(index + 1)
      event.preventDefault()
    }
  }

  protected onInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement
    const raw = input.value
    const clean = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

    if (clean.length <= 1) {
      // Single char — normal flow
      this.setTile(index, clean)
      // Sync native value to single clean char
      input.value = clean
      this.emitChange()
      if (clean && index < TILE_COUNT - 1) {
        this.focusTile(index + 1)
      }
    } else {
      // Multi-char (iOS SMS autofill / IME) — distribute like paste
      let charIdx = 0
      for (let i = index; i < TILE_COUNT && charIdx < clean.length; i++, charIdx++) {
        this.setTile(i, clean[charIdx] ?? '')
      }
      this.emitChange()
      const lastFilled = Math.min(index + clean.length - 1, TILE_COUNT - 1)
      const nextFocus = Math.min(lastFilled + 1, TILE_COUNT - 1)
      this.focusTile(nextFocus)
    }
  }

  protected onPaste(event: ClipboardEvent, startIndex: number): void {
    event.preventDefault()
    const pasted = event.clipboardData?.getData('text') ?? ''
    const clean = pasted.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

    let charIdx = 0
    for (let i = startIndex; i < TILE_COUNT && charIdx < clean.length; i++, charIdx++) {
      this.setTile(i, clean[charIdx] ?? '')
    }
    this.emitChange()
    this.onTouched()

    // Focus last filled tile or the tile after
    const lastFilled = Math.min(startIndex + clean.length - 1, TILE_COUNT - 1)
    const nextFocus = Math.min(lastFilled + 1, TILE_COUNT - 1)
    this.focusTile(nextFocus)
  }

  // Private helpers ------------------------------------------------------

  private setTile(index: number, char: string): void {
    this.tiles.update(prev => prev.map((t, i) => (i === index ? char : t)))
  }

  private emitChange(): void {
    const value = this.tiles().join('')
    this.onChange(value)
  }

  private focusTile(index: number): void {
    const inputs = this.tileInputs?.toArray()
    if (inputs?.[index]) {
      inputs[index].nativeElement.focus()
      this.focusedIndex.set(index)
    }
  }
}
