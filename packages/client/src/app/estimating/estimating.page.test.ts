/**
 * Tests for EstimatingPage — `parseTicketIdHref` URL parsing.
 *
 * The unanimous auto-reveal predicate now lives in `@hnch/shared`
 * (`shouldAutoReveal`); its test surface is `packages/shared/src/auto-reveal.test.ts`.
 *
 * Intentionally absent:
 *  - CSS prefers-reduced-motion check — JSDOM does not evaluate CSS; blocked gap.
 *  - Keyboard-wiring source scans — source-scanning provides no regression signal;
 *    behavioral coverage is in estimating.page.keyboard.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({
  IonAccordion: {},
  IonAccordionGroup: {},
  IonBackButton: {},
  IonButton: {},
  IonButtons: {},
  IonCard: {},
  IonCardContent: {},
  IonChip: {},
  IonCol: {},
  IonContent: {},
  IonFooter: {},
  IonGrid: {},
  IonHeader: {},
  IonIcon: {},
  IonItem: {},
  IonLabel: {},
  IonList: {},
  IonListHeader: {},
  IonRow: {},
  IonTitle: {},
  IonToast: {},
  IonToolbar: {},
  ActionSheetController: class ActionSheetController {},
  AlertController: class AlertController {},
  ModalController: class ModalController {},
  PopoverController: class PopoverController {},
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { parseTicketIdHref } from './estimating.page';

describe('EstimatingPage', () => {
  describe('parseTicketIdHref', () => {
    it('returns null for undefined', () => {
      expect(parseTicketIdHref(undefined)).toBeNull();
    });
    it('returns null for non-URL plain ticket id', () => {
      expect(parseTicketIdHref('PROJ-1234')).toBeNull();
    });
    it('returns url for https', () => {
      expect(parseTicketIdHref('https://x.com')).toBe('https://x.com');
    });
    it('returns url for http', () => {
      expect(parseTicketIdHref('http://x')).toBe('http://x');
    });
    it('rejects javascript: scheme', () => {
      expect(parseTicketIdHref('javascript:alert(1)')).toBeNull();
    });
    it('rejects ftp:', () => {
      expect(parseTicketIdHref('ftp://x')).toBeNull();
    });
    it('trims whitespace and returns trimmed url', () => {
      expect(parseTicketIdHref('  https://x  ')).toBe('https://x');
    });
    it('returns null for malformed "http://"', () => {
      expect(parseTicketIdHref('http://')).toBeNull();
    });
    it('returns null for empty string', () => {
      expect(parseTicketIdHref('')).toBeNull();
    });
  });
});
