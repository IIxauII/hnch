/**
 * PROTOTYPE (#643), throwaway. Angular wrapper around the framework-free RoomModel.
 *
 * Read the model in templates through `store.m()` — it reads the `version`
 * signal, so OnPush components re-render on every model change:
 *
 *   @let m = store.m();
 *   <h1>{{ m.currentStory?.title }}</h1>  <button (click)="m.vote('8')">8</button>
 *
 * Everything that is UI-only (device frame, theme, open overlay, highlighted
 * register entry, entry-flow state) lives here as signals, not in the model.
 */
import { computed, Injectable, signal } from '@angular/core';

import { type FixtureName, RoomModel } from './room-model';

export type Frame = 'phone' | 'small-phone' | 'tablet' | 'desktop' | 'wide';
export type Screen = 'home' | 'join' | 'room' | 'system';

/** One overlay at a time, never stacked (R-22). Owned by the room-chrome / entry components. */
export type Overlay =
  | null
  | 'invite'
  | 'people'
  | 'stories'
  | 'add-stories'
  | 'menu'
  | 'room-settings'
  | 'profile'
  | 'keys'
  | 'confirm-end'
  | 'confirm-remove'
  | 'confirm-leave-host'
  | 'confirm-leave-first';

export const FRAME_SIZE: Record<
  Frame,
  { w: number; h: number; pointer: 'coarse' | 'fine'; label: string }
> = {
  'small-phone': { w: 320, h: 568, pointer: 'coarse', label: 'Phone SE 320' },
  phone: { w: 390, h: 844, pointer: 'coarse', label: 'Phone 390' },
  tablet: { w: 820, h: 1180, pointer: 'coarse', label: 'Tablet 820' },
  desktop: { w: 1280, h: 800, pointer: 'fine', label: 'Desktop 1280' },
  wide: { w: 1680, h: 1000, pointer: 'fine', label: 'Wide 1680' },
};

@Injectable({ providedIn: 'root' })
export class ProtoStore {
  readonly model = new RoomModel('waiting', 'hana');
  private readonly version = signal(0);

  // UI-only state
  readonly frame = signal<Frame>('phone');
  readonly theme = signal<'light' | 'dark'>('light');
  readonly reducedMotion = signal(false);
  readonly screen = signal<Screen>('room');
  readonly overlay = signal<Overlay>(null);
  /** Extra argument for the open overlay (e.g. the person to remove). */
  readonly overlayArg = signal<string | null>(null);
  /** Register entry the lab panel is pointing at; elements with a matching data-ux get outlined. */
  readonly highlight = signal<string | null>(null);
  /**
   * Entry-flow knobs for Home / Join (owned by the entry components; the lab
   * panel and scenes set them). Free-form so the entry agent can add keys.
   */
  readonly entry = signal<Record<string, string | boolean | number>>({});

  readonly pointer = computed(() => FRAME_SIZE[this.frame()].pointer);
  readonly isDesktop = computed(() => this.frame() === 'desktop' || this.frame() === 'wide');

  constructor() {
    this.model.subscribe(() => this.version.update((v) => v + 1));
    setInterval(() => this.model.tick(Date.now()), 100);
  }

  /** Read the model reactively. */
  m(): RoomModel {
    this.version();
    return this.model;
  }

  /** Force a re-render after mutating model state directly (prefer model methods). */
  bump() {
    this.version.update((v) => v + 1);
  }

  load(fixture: FixtureName, as?: string) {
    this.overlay.set(null);
    this.model.load(fixture, as);
  }

  open(o: Overlay, arg: string | null = null) {
    this.overlay.set(o);
    this.overlayArg.set(arg);
  }
  close() {
    this.overlay.set(null);
    this.overlayArg.set(null);
  }

  setEntry(patch: Record<string, string | boolean | number>) {
    this.entry.update((e) => ({ ...e, ...patch }));
  }
}
