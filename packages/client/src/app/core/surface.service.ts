import { Injectable, inject, signal, type Signal } from '@angular/core';
import {
  ActionSheetController,
  ModalController,
  PopoverController,
  type ModalOptions,
} from '@ionic/angular/standalone';

import { MenuPopoverComponent, type MenuItem } from '../shared/menu-popover/menu-popover.component';

/** Surface mode — mobile (touch/narrow) vs desktop (pointer-fine + wide). */
export type SurfaceMode = 'mobile' | 'desktop';

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
 * Pattern mirrors ThemeService: matchMedia subscription updates a signal.
 */
@Injectable({ providedIn: 'root' })
export class SurfaceService {
  private readonly modeSignal = signal<SurfaceMode>(this.detect());
  private readonly mq: MediaQueryList = window.matchMedia('(min-width: 768px) and (pointer: fine)');
  private readonly mqListener = (e: MediaQueryListEvent) => {
    this.modeSignal.set(e.matches ? 'desktop' : 'mobile');
  };

  private readonly modalCtrl = inject(ModalController);
  private readonly popoverCtrl = inject(PopoverController);
  private readonly actionSheetCtrl = inject(ActionSheetController);

  constructor() {
    this.mq.addEventListener('change', this.mqListener);
  }

  /** Current surface mode signal — read-only. */
  readonly mode: Signal<SurfaceMode> = this.modeSignal.asReadonly();

  /**
   * Create and present a modal. On desktop, adds `modal-centered` CSS class
   * so `global.scss` styles it as a centered dialog; removes sheet breakpoints.
   * On mobile, passes `opts` unchanged (breakpoints/initialBreakpoint preserved).
   */
  async openModal(opts: ModalOptions): Promise<HTMLIonModalElement> {
    let resolvedOpts: ModalOptions = { ...opts };

    if (this.modeSignal() === 'desktop') {
      const existing = resolvedOpts.cssClass;
      const classes = Array.isArray(existing) ? existing : existing ? [existing] : [];

      resolvedOpts = {
        ...resolvedOpts,
        cssClass: [...classes, 'modal-centered'],
        // Omit sheet breakpoints on desktop — centered dialog, not a sheet.
        breakpoints: undefined,
        initialBreakpoint: undefined,
      };
    }

    const modal = await this.modalCtrl.create(resolvedOpts);
    await modal.present();
    return modal;
  }

  /**
   * Present a contextual menu. Mobile → ActionSheet anchored to bottom.
   * Desktop → MenuPopover anchored to the trigger event's target.
   */
  async openSheetOrPopover(opts: SheetOrPopoverOptions): Promise<void> {
    if (this.modeSignal() === 'desktop') {
      const popover = await this.popoverCtrl.create({
        component: MenuPopoverComponent,
        componentProps: {
          items: opts.items,
          header: opts.header,
        },
        event: opts.triggerEvent,
        dismissOnSelect: true,
      });
      await popover.present();
      return;
    }

    // Mobile: ActionSheet
    const buttons = opts.items.map((item) => ({
      text: item.text,
      role: item.role,
      icon: item.icon,
      handler: item.handler,
    }));

    const sheet = await this.actionSheetCtrl.create({
      header: opts.header,
      buttons,
    });
    await sheet.present();
  }

  private detect(): SurfaceMode {
    if (typeof window === 'undefined') return 'mobile';
    return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches
      ? 'desktop'
      : 'mobile';
  }
}
