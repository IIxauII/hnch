import { Injectable, computed, inject, signal, type Signal } from '@angular/core';
import { ActionSheetController, PopoverController } from '@ionic/angular/standalone';

import { MenuPopoverComponent, type MenuItem } from '../shared/menu-popover/menu-popover.component';

/** Surface mode — mobile (touch/narrow) vs desktop (pointer-fine + wide). */
export type SurfaceMode = 'mobile' | 'desktop';

/** What a menu is presented as: the part of either overlay this service uses. */
interface MenuOverlay {
  dismiss(data?: unknown, role?: string): Promise<boolean>;
  onDidDismiss(): Promise<unknown>;
}

/**
 * Options for the unified sheet-or-popover helper.
 * On mobile renders an ActionSheet; on desktop a MenuPopover.
 */
export interface SheetOrPopoverOptions {
  header?: string;
  items: MenuItem[];
  /** The DOM event used to anchor the popover on desktop. */
  triggerEvent?: Event;
}

/**
 * SurfaceService — detects the current rendering surface (mobile vs desktop)
 * and provides helpers that pick the appropriate Ionic overlay.
 *
 * Pivot condition: `(min-width: 768px) and (pointer: fine)`.
 * Fine-pointer check means touch laptops keep the mobile UX.
 *
 * Sheets are inline `ion-modal`s in the page that owns them (ionic.md):
 * they take their breakpoints from here and their desktop shape from the
 * `modal-centered` class. Menus are opened from here, in code, like alerts
 * and toasts. (One sheet is made in code as well: the QR scanner's camera
 * overlay, which belongs to a service, not to a page.)
 *
 * Pattern mirrors ThemeService: matchMedia subscription updates a signal.
 */
@Injectable({ providedIn: 'root' })
export class SurfaceService {
  private readonly modeSignal = signal<SurfaceMode>(this.detect());
  private readonly mq: MediaQueryList = window.matchMedia('(min-width: 768px) and (pointer: fine)');
  private readonly mqListener = (e: MediaQueryListEvent) => {
    this.modeSignal.set(e.matches ? 'desktop' : 'mobile');
  };

  private readonly popoverCtrl = inject(PopoverController);
  private readonly actionSheetCtrl = inject(ActionSheetController);

  /** The menu `openSheetOrPopover` presented last, while it is still up. */
  private openMenu: MenuOverlay | null = null;

  constructor() {
    this.mq.addEventListener('change', this.mqListener);
  }

  /** Current surface mode signal — read-only. */
  readonly mode: Signal<SurfaceMode> = this.modeSignal.asReadonly();

  /**
   * Breakpoints for half-sheet modals. `undefined` on desktop so Ionic
   * does not engage sheet mode — the `modal-centered` CSS dialog takes over.
   * Standard variant: [0, 0.6, 0.95].
   */
  readonly sheetBreakpoints = computed<[number, number, number] | undefined>(() =>
    this.modeSignal() === 'desktop' ? undefined : [0, 0.6, 0.95],
  );

  /**
   * Initial breakpoint for standard half-sheets. `undefined` on desktop.
   */
  readonly initialSheetBreakpoint = computed<number | undefined>(() =>
    this.modeSignal() === 'desktop' ? undefined : 0.6,
  );

  /**
   * Breakpoints variant for full-height sheets ([0, 0.6, 1]).
   * `undefined` on desktop.
   */
  readonly sheetBreakpointsFull = computed<[number, number, number] | undefined>(() =>
    this.modeSignal() === 'desktop' ? undefined : [0, 0.6, 1],
  );

  /**
   * Initial breakpoint for full-height sheets (initialBreakpoint=1).
   * `undefined` on desktop.
   */
  readonly initialSheetBreakpointFull = computed<number | undefined>(() =>
    this.modeSignal() === 'desktop' ? undefined : 1,
  );

  /**
   * Present a contextual menu. Mobile → ActionSheet anchored to bottom.
   * Desktop → MenuPopover anchored to the trigger event's target.
   */
  async openSheetOrPopover(opts: SheetOrPopoverOptions): Promise<void> {
    if (this.modeSignal() === 'desktop') {
      const popoverOpts: Parameters<typeof this.popoverCtrl.create>[0] = {
        component: MenuPopoverComponent,
        componentProps: {
          items: opts.items,
          header: opts.header,
        },
        dismissOnSelect: true,
      };
      if (opts.triggerEvent !== undefined) {
        popoverOpts.event = opts.triggerEvent;
      }
      const popover = await this.popoverCtrl.create(popoverOpts);
      this.track(popover);
      await popover.present();
      return;
    }

    // Mobile: ActionSheet
    const buttons = opts.items.map((item) => {
      type Btn = {
        text: string;
        role?: string;
        icon?: string;
        handler?: () => void | boolean | Promise<void | boolean>;
      };
      const btn: Btn = { text: item.text };
      if (item.role !== undefined) btn.role = item.role;
      if (item.icon !== undefined) btn.icon = item.icon;
      if (item.handler !== undefined) btn.handler = item.handler;
      return btn;
    });

    const sheetOpts: Parameters<typeof this.actionSheetCtrl.create>[0] = { buttons };
    if (opts.header !== undefined) sheetOpts.header = opts.header;
    const sheet = await this.actionSheetCtrl.create(sheetOpts);
    this.track(sheet);
    await sheet.present();
  }

  /**
   * Close the menu opened through `openSheetOrPopover`, if it is still up.
   *
   * A menu belongs to the screen it was opened on. Pages call this when they
   * are left, so a menu opened on Estimating does not end up floating over
   * the Lobby after the round reveals underneath it.
   */
  async dismissMenu(): Promise<void> {
    const menu = this.openMenu;
    if (menu === null) return;
    this.openMenu = null;
    try {
      await menu.dismiss(undefined, 'cancel');
    } catch {
      // Already on its way out.
    }
  }

  private track(menu: MenuOverlay): void {
    this.openMenu = menu;
    void menu.onDidDismiss().then(() => {
      if (this.openMenu === menu) this.openMenu = null;
    });
  }

  private detect(): SurfaceMode {
    if (typeof window === 'undefined') return 'mobile';
    return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches
      ? 'desktop'
      : 'mobile';
  }
}
