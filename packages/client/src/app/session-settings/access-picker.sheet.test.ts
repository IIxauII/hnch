/**
 * Unit tests for AccessPickerSheetComponent — uses real component via
 * TestBed.createComponent. Inputs are wired through componentRef.setInput;
 * protected onModeChange / onPasswordCommit are invoked through a cast.
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
    'IonRadio',
    'IonRadioGroup',
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

import type { AccessMode, AccessSelection } from './access-picker.sheet';

interface AccessSheetInternals {
  passwordControl: { setValue(v: string): void };
  onModeChange(mode: AccessMode | null | undefined): void;
  onPasswordCommit(): void;
}

async function mount(currentMode: AccessMode, passwordValue = '') {
  const { AccessPickerSheetComponent } = await import('./access-picker.sheet');
  const fixture = TestBed.createComponent(AccessPickerSheetComponent);
  fixture.componentRef.setInput('currentMode', currentMode);
  fixture.componentRef.setInput('currentPassword', passwordValue);
  // Skip detectChanges: the [formControl] binding on the stubbed
  // ion-input would fail without a ControlValueAccessor. We only
  // exercise the protected methods directly, so the template does
  // not need to render.
  const internals = fixture.componentInstance as unknown as AccessSheetInternals;
  // Component seeds the FormControl on a microtask from the input, but
  // tests need a deterministic value — set it explicitly.
  internals.passwordControl.setValue(passwordValue);
  const emit = vi.fn<(s: AccessSelection) => void>();
  fixture.componentInstance.selected.subscribe(emit);
  return { fixture, internals, emit };
}

describe('AccessPickerSheetComponent.onModeChange()', () => {
  it('does nothing when mode is null', async () => {
    const { internals, emit } = await mount('open');
    internals.onModeChange(null);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does nothing when mode is undefined', async () => {
    const { internals, emit } = await mount('open');
    internals.onModeChange(undefined);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does nothing when mode is unchanged (prevents spurious doc writes)', async () => {
    const { internals, emit } = await mount('open');
    internals.onModeChange('open');
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits password mode with current control value when switching open → password', async () => {
    const { internals, emit } = await mount('open', 'typed-so-far');
    internals.onModeChange('password');
    expect(emit).toHaveBeenCalledWith({ mode: 'password', password: 'typed-so-far' });
  });

  it('emits open mode with null password when switching password → open', async () => {
    const { internals, emit } = await mount('password', 'secret');
    internals.onModeChange('open');
    expect(emit).toHaveBeenCalledWith({ mode: 'open', password: null });
  });
});

describe('AccessPickerSheetComponent.onPasswordCommit()', () => {
  it('does not emit when current mode is open', async () => {
    const { internals, emit } = await mount('open', 'some-text');
    internals.onPasswordCommit();
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits password selection with the control value when mode is password', async () => {
    const { internals, emit } = await mount('password', 'hunter2');
    internals.onPasswordCommit();
    expect(emit).toHaveBeenCalledWith({ mode: 'password', password: 'hunter2' });
  });

  it('emits with empty string when control is empty (commit with no input)', async () => {
    const { internals, emit } = await mount('password', '');
    internals.onPasswordCommit();
    expect(emit).toHaveBeenCalledWith({ mode: 'password', password: '' });
  });
});
