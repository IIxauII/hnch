/**
 * PROTOTYPE (#643). Browser chrome (UX-053): tab title per screen, a runtime
 * `<meta name="theme-color">` that matches `--hn-bg` in the current theme, and
 * the dot favicon. Root service: Home, Join and System inject it, and once
 * alive its effect also follows the Room ("Sprint 42 · hnch").
 */
import { effect, Injectable, inject, signal } from '@angular/core';

import { ProtoStore } from '../proto-store';

/** The brand mark as a favicon: one racing-green dot on paper (an asset, so literal colours). */
export const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#F6F6F3"/><circle cx="16" cy="16" r="7" fill="#0B3D2E"/></svg>';

export const MANIFEST = {
  name: 'hnch · pointing poker',
  short_name: 'hnch',
  start_url: '/',
  display: 'standalone',
  background_color: '#F6F6F3',
  theme_color: '#F6F6F3',
  icons: [{ src: '/assets/icon/hnch.svg', sizes: 'any', type: 'image/svg+xml' }],
};

/** What index.html should ship: pinch-zoom stays on (UX-070). */
export const VIEWPORT_SHIP = 'width=device-width, initial-scale=1, viewport-fit=cover';

@Injectable({ providedIn: 'root' })
export class ProtoBrowserChrome {
  private readonly store = inject(ProtoStore);
  readonly title = signal('hnch');
  readonly themeColor = signal('');

  constructor() {
    if (typeof document === 'undefined') return;
    this.setFavicon();
    effect(() => {
      const screen = this.store.screen();
      const theme = this.store.theme();
      const m = this.store.m();
      const name = m.state.name;
      const title =
        screen === 'room'
          ? `${name} · hnch`
          : screen === 'join'
            ? `Join · hnch`
            : screen === 'system'
              ? 'Design system · hnch'
              : 'hnch';
      document.title = title;
      this.title.set(title);
      // read --hn-bg after the frame's data-theme has been updated
      setTimeout(() => this.applyThemeColor(theme), 0);
    });
  }

  private applyThemeColor(theme: 'light' | 'dark') {
    const device = document.querySelector('.proto-device.hn-proto');
    const bg = device
      ? getComputedStyle(device).getPropertyValue('--hn-bg').trim()
      : theme === 'dark'
        ? '#101211'
        : '#f6f6f3';
    let metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    if (!metas.length) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
      metas = [meta];
    }
    // the prototype's theme toggle wins over prefers-color-scheme, so every theme-color meta follows it
    for (const meta of metas) meta.content = bg;
    this.themeColor.set(bg);
  }

  private setFavicon() {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;
  }
}
