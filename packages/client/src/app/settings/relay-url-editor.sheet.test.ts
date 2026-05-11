/**
 * Unit tests for RelayUrlEditorSheetComponent.
 *
 * - validator: imports the real `validateRelayUrl` helper.
 * - onDone / onClear: real component instance via TestBed.createComponent;
 *   protected methods invoked through a cast.
 */

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');
  const stubs: Record<string, unknown> = {};
  for (const tag of [
    'IonButton',
    'IonButtons',
    'IonContent',
    'IonHeader',
    'IonInput',
    'IonItem',
    'IonLabel',
    'IonList',
    'IonNote',
    'IonTitle',
    'IonToolbar',
  ]) {
    @Comp({
      selector: tag
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .slice(1),
      template: '<ng-content/>',
      standalone: true,
    })
    class Stub {}
    stubs[tag] = Stub;
  }
  return stubs;
});

import { validateRelayUrl } from './relay-url-editor.helpers';

interface SheetInternals {
  urlCtrl: { setValue(v: string): void };
  onDone(): void;
  onClear(): void;
}

async function mount(initial = '') {
  const { RelayUrlEditorSheetComponent } = await import('./relay-url-editor.sheet');
  const fixture = TestBed.createComponent(RelayUrlEditorSheetComponent);
  fixture.componentRef.setInput('currentUrl', initial);
  // Skip detectChanges: ion-input stub lacks ControlValueAccessor and the
  // [formControl] binding would throw. Only the protected methods are
  // exercised here, and they read the FormControl directly.
  const internals = fixture.componentInstance as unknown as SheetInternals;
  internals.urlCtrl.setValue(initial);
  const saved = vi.fn<(v: string | undefined) => void>();
  const closeRequested = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  fixture.componentInstance.closeRequested.subscribe(closeRequested);
  return { fixture, internals, saved, closeRequested };
}

describe('relay URL validator', () => {
  it('empty string is valid (signals "use default")', () => {
    expect(validateRelayUrl('')).toBeNull();
  });

  it('whitespace-only string is valid (treated as empty)', () => {
    expect(validateRelayUrl('   ')).toBeNull();
  });

  it('valid https:// URL passes', () => {
    expect(validateRelayUrl('https://relay.example.com')).toBeNull();
  });

  it('valid http:// URL passes', () => {
    expect(validateRelayUrl('http://localhost:1234')).toBeNull();
  });

  it('https URL with trailing slash passes', () => {
    expect(validateRelayUrl('https://relay.example.com/')).toBeNull();
  });

  it('URL with path passes', () => {
    expect(validateRelayUrl('https://relay.example.com/api')).toBeNull();
  });

  it('URL without protocol is invalid', () => {
    expect(validateRelayUrl('relay.example.com')).toEqual({ invalidUrl: true });
  });

  it('ftp:// URL is invalid', () => {
    expect(validateRelayUrl('ftp://relay.example.com')).toEqual({ invalidUrl: true });
  });

  it('ws:// URL is invalid', () => {
    expect(validateRelayUrl('ws://relay.example.com')).toEqual({ invalidUrl: true });
  });

  it('leading whitespace is stripped before validation', () => {
    expect(validateRelayUrl('  https://relay.example.com')).toBeNull();
  });

  it('trailing whitespace is stripped before validation', () => {
    expect(validateRelayUrl('https://relay.example.com  ')).toBeNull();
  });

  it('invalid URL with leading whitespace is still invalid after strip', () => {
    expect(validateRelayUrl('  not-a-url  ')).toEqual({ invalidUrl: true });
  });
});

describe('RelayUrlEditorSheetComponent.onDone()', () => {
  it('emits trimmed URL and requests close', async () => {
    const { internals, saved, closeRequested } = await mount('https://relay.example.com');
    internals.onDone();
    expect(saved).toHaveBeenCalledWith('https://relay.example.com');
    expect(closeRequested).toHaveBeenCalled();
  });

  it('emits undefined when value is whitespace-only', async () => {
    const { internals, saved } = await mount('   ');
    internals.onDone();
    expect(saved).toHaveBeenCalledWith(undefined);
  });

  it('trims the emitted URL', async () => {
    const { internals, saved } = await mount('  https://relay.example.com  ');
    internals.onDone();
    expect(saved).toHaveBeenCalledWith('https://relay.example.com');
  });
});

describe('RelayUrlEditorSheetComponent.onClear()', () => {
  it('always emits undefined and requests close', async () => {
    const { internals, saved, closeRequested } = await mount('https://relay.example.com');
    internals.onClear();
    expect(saved).toHaveBeenCalledWith(undefined);
    expect(closeRequested).toHaveBeenCalled();
  });
});
