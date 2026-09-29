/**
 * Unit tests for PasswordPromptSheetComponent.onConfirm() — uses real
 * component via TestBed.createComponent. Sets the password value through
 * the real FormControl, invokes the real protected onConfirm via cast,
 * and asserts on real output emissions.
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
    'IonInputPasswordToggle',
    'IonItem',
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

interface PasswordSheetInternals {
  passwordControl: { setValue(v: string): void };
  onConfirm(): void;
}

async function mount() {
  const { PasswordPromptSheetComponent } = await import('./password-prompt.sheet');
  const fixture = TestBed.createComponent(PasswordPromptSheetComponent);
  const emit = vi.fn();
  fixture.componentInstance.passwordSubmitted.subscribe(emit);
  const internals = fixture.componentInstance as unknown as PasswordSheetInternals;
  return { fixture, internals, emit };
}

describe('PasswordPromptSheetComponent.onConfirm()', () => {
  it('does not emit when password exceeds 120 characters (invalid FormControl)', async () => {
    const { internals, emit } = await mount();
    internals.passwordControl.setValue('x'.repeat(121));
    internals.onConfirm();
    expect(emit).not.toHaveBeenCalled();
  });

  it('allows exactly 120 characters (boundary — valid)', async () => {
    const { internals, emit } = await mount();
    const atLimit = 'a'.repeat(120);
    internals.passwordControl.setValue(atLimit);
    internals.onConfirm();
    expect(emit).toHaveBeenCalledWith(atLimit);
  });

  it('emits empty string for empty input (blank password is allowed)', async () => {
    const { internals, emit } = await mount();
    internals.passwordControl.setValue('');
    internals.onConfirm();
    expect(emit).toHaveBeenCalledWith('');
  });

  it('emits empty string for whitespace-only input (trimmed)', async () => {
    const { internals, emit } = await mount();
    internals.passwordControl.setValue('   ');
    internals.onConfirm();
    expect(emit).toHaveBeenCalledWith('');
  });

  it('emits the password value for a valid non-empty string', async () => {
    const { internals, emit } = await mount();
    internals.passwordControl.setValue('hunter2');
    internals.onConfirm();
    expect(emit).toHaveBeenCalledWith('hunter2');
  });

  it('trims surrounding whitespace from the emitted password', async () => {
    const { internals, emit } = await mount();
    internals.passwordControl.setValue('  secret  ');
    internals.onConfirm();
    expect(emit).toHaveBeenCalledWith('secret');
  });
});
