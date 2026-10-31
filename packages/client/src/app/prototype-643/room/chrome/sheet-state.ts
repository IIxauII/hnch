/** PROTOTYPE (#643). Per-layer sheet state (provided by proto-room-overlays). */
import { Injectable, signal } from '@angular/core';

@Injectable()
export class SheetState {
  /** Phone sheets: false = 60 % detent, true = 95 % (the handle cycles them). */
  readonly expanded = signal(false);
}
