// Exercises: round-start.helpers:buildRoundStartTitle, buildRoundStartTicketId
// and the RoundStartSheetComponent's submit() emission shape.

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoundStartTicketId, buildRoundStartTitle } from './round-start.helpers';

// Which surface the sheet finds itself on, and what it asked to be focused.
const surface = vi.hoisted(() => ({ mode: 'mobile' as 'mobile' | 'desktop' }));
const focusFieldMock = vi.hoisted(() => vi.fn<(field: unknown) => Promise<void>>());

vi.mock('../core/surface.service', () => ({ SurfaceService: class SurfaceService {} }));
vi.mock('../utils/focus-field', () => ({ focusField: focusFieldMock }));

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, forwardRef } = await import('@angular/core');
  const { NG_VALUE_ACCESSOR } = await import('@angular/forms');
  const selectorOf = (tag: string): string =>
    tag
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .slice(1);

  const stubs: Record<string, unknown> = {};
  for (const tag of [
    'IonButton',
    'IonButtons',
    'IonContent',
    'IonHeader',
    'IonItem',
    'IonList',
    'IonNote',
    'IonTitle',
    'IonToolbar',
  ]) {
    @Comp({ selector: selectorOf(tag), template: '<ng-content/>', standalone: true })
    class Stub {}
    stubs[tag] = Stub;
  }
  // The two that carry a form control need to be able to take one.
  for (const tag of ['IonInput', 'IonTextarea']) {
    @Comp({
      selector: selectorOf(tag),
      template: '',
      standalone: true,
      providers: [
        { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Field), multi: true },
      ],
    })
    class Field {
      writeValue(): void {}
      registerOnChange(): void {}
      registerOnTouched(): void {}
    }
    stubs[tag] = Field;
  }
  return stubs;
});

interface SheetInternals {
  titleControl: { value: string; setValue(v: string): void };
  ticketIdControl: { value: string; setValue(v: string): void };
  descriptionControl: { value: string; setValue(v: string): void };
  isSubmitting: { (): boolean };
  submit(): void;
}

beforeEach(async () => {
  const { SurfaceService } = await import('../core/surface.service');
  TestBed.configureTestingModule({
    providers: [{ provide: SurfaceService, useValue: { mode: () => surface.mode } }],
  });
});

async function mount() {
  const { RoundStartSheetComponent } = await import('./round-start.sheet');
  const fixture = TestBed.createComponent(RoundStartSheetComponent);
  fixture.componentRef.setInput('roundNumber', 1);
  const submitted = vi.fn();
  const cancelled = vi.fn();
  fixture.componentInstance.submitted.subscribe(submitted);
  fixture.componentInstance.cancelled.subscribe(cancelled);
  const internals = fixture.componentInstance as unknown as SheetInternals;
  return { fixture, internals, submitted, cancelled };
}

describe('buildRoundStartTitle — empty / whitespace → null', () => {
  it('empty string returns null (descriptor is optional)', () => {
    expect(buildRoundStartTitle('')).toBeNull();
  });

  it('whitespace-only returns null', () => {
    expect(buildRoundStartTitle('   ')).toBeNull();
  });

  it('tab-only returns null', () => {
    expect(buildRoundStartTitle('\t')).toBeNull();
  });
});

describe('buildRoundStartTitle — title trimming', () => {
  it('trims leading and trailing whitespace', () => {
    expect(buildRoundStartTitle('  Login redesign  ')).toBe('Login redesign');
  });

  it('preserves internal whitespace', () => {
    expect(buildRoundStartTitle('Login  flow')).toBe('Login  flow');
  });
});

describe('buildRoundStartTitle — normal submission', () => {
  it('non-empty title is returned trimmed', () => {
    expect(buildRoundStartTitle('Auth refactor')).toBe('Auth refactor');
  });
});

describe('buildRoundStartTicketId — empty / whitespace → null', () => {
  it('empty string returns null (ticketId is optional)', () => {
    expect(buildRoundStartTicketId('')).toBeNull();
  });

  it('whitespace-only returns null', () => {
    expect(buildRoundStartTicketId('   ')).toBeNull();
  });

  it('tab-only returns null', () => {
    expect(buildRoundStartTicketId('\t')).toBeNull();
  });
});

describe('buildRoundStartTicketId — trimming', () => {
  it('trims leading and trailing whitespace', () => {
    expect(buildRoundStartTicketId('  PROJ-1234  ')).toBe('PROJ-1234');
  });

  it('preserves internal characters verbatim (URL form)', () => {
    expect(buildRoundStartTicketId('https://example.com/PROJ-1')).toBe(
      'https://example.com/PROJ-1',
    );
  });
});

describe('buildRoundStartTicketId — normal submission', () => {
  it('non-empty ticket ID is returned trimmed', () => {
    expect(buildRoundStartTicketId('PROJ-42')).toBe('PROJ-42');
  });
});

describe('RoundStartSheetComponent.submit() — field emission', () => {
  it('emits both fields when title and ticketId are set', async () => {
    const { internals, submitted } = await mount();
    internals.titleControl.setValue('Auth migration');
    internals.ticketIdControl.setValue('PROJ-42');
    internals.submit();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Auth migration', ticketId: 'PROJ-42' }),
    );
  });

  it('emits null for both fields when both are blank', async () => {
    const { internals, submitted } = await mount();
    internals.submit();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ title: null, ticketId: null }),
    );
  });

  it('emits null for ticketId when only title is set', async () => {
    const { internals, submitted } = await mount();
    internals.titleControl.setValue('Title only');
    internals.submit();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Title only', ticketId: null }),
    );
  });

  it('emits null for title when only ticketId is set', async () => {
    const { internals, submitted } = await mount();
    internals.ticketIdControl.setValue('PROJ-99');
    internals.submit();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ title: null, ticketId: 'PROJ-99' }),
    );
  });
});

describe('RoundStartSheetComponent.submit() — trimming and guard', () => {
  it('trims whitespace from both fields', async () => {
    const { internals, submitted } = await mount();
    internals.titleControl.setValue('  trimmed  ');
    internals.ticketIdControl.setValue('  PROJ-7  ');
    internals.submit();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'trimmed', ticketId: 'PROJ-7' }),
    );
  });

  it('whitespace-only inputs become null', async () => {
    const { internals, submitted } = await mount();
    internals.titleControl.setValue('   ');
    internals.ticketIdControl.setValue('\t');
    internals.submit();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ title: null, ticketId: null }),
    );
  });

  it('latches isSubmitting after submit; second submit is a no-op', async () => {
    const { internals, submitted } = await mount();
    internals.titleControl.setValue('Once');
    internals.submit();
    internals.submit();
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(internals.isSubmitting()).toBe(true);
  });
});

describe('RoundStartSheetComponent.ngOnInit() — prefill present', () => {
  it('pre-fills all fields when prefillAgendaItem is set', async () => {
    const { RoundStartSheetComponent } = await import('./round-start.sheet');
    const fixture = TestBed.createComponent(RoundStartSheetComponent);
    fixture.componentRef.setInput('roundNumber', 2);
    fixture.componentRef.setInput('prefillAgendaItem', {
      id: 'item-1',
      state: 'pending',
      source: 'manual',
      sortKey: 'a0',
      createdAt: Date.now(),
      title: 'Auth redesign',
      ticketId: 'PROJ-42',
      description: 'Some context',
    });
    fixture.componentInstance.ngOnInit();

    const internals = fixture.componentInstance as unknown as SheetInternals;
    expect(internals.titleControl.value).toBe('Auth redesign');
    expect(internals.ticketIdControl.value).toBe('PROJ-42');
    expect(internals.descriptionControl.value).toBe('Some context');
  });

  it('does not throw when prefillAgendaItem is null', async () => {
    const { RoundStartSheetComponent } = await import('./round-start.sheet');
    const fixture = TestBed.createComponent(RoundStartSheetComponent);
    fixture.componentRef.setInput('roundNumber', 1);
    fixture.componentRef.setInput('prefillAgendaItem', null);
    expect(() => fixture.componentInstance.ngOnInit()).not.toThrow();

    const internals = fixture.componentInstance as unknown as SheetInternals;
    expect(internals.titleControl.value).toBe('');
  });
});

describe('RoundStartSheetComponent.ngOnInit() — prefill absent fields', () => {
  it('uses empty string when agenda item title is absent', async () => {
    const { RoundStartSheetComponent } = await import('./round-start.sheet');
    const fixture = TestBed.createComponent(RoundStartSheetComponent);
    fixture.componentRef.setInput('roundNumber', 1);
    fixture.componentRef.setInput('prefillAgendaItem', {
      id: 'item-2',
      state: 'pending',
      source: 'manual',
      sortKey: 'a0',
      createdAt: Date.now(),
      ticketId: 'PROJ-99',
    });
    fixture.componentInstance.ngOnInit();

    const internals = fixture.componentInstance as unknown as SheetInternals;
    expect(internals.titleControl.value).toBe('');
    expect(internals.ticketIdControl.value).toBe('PROJ-99');
    expect(internals.descriptionControl.value).toBe('');
  });

  it('emit includes agendaItemId when prefillAgendaItem is set', async () => {
    const { RoundStartSheetComponent } = await import('./round-start.sheet');
    const fixture = TestBed.createComponent(RoundStartSheetComponent);
    fixture.componentRef.setInput('roundNumber', 1);
    fixture.componentRef.setInput('prefillAgendaItem', {
      id: 'item-3',
      state: 'pending',
      source: 'manual',
      sortKey: 'a0',
      createdAt: Date.now(),
      title: 'Story',
    });
    fixture.componentInstance.ngOnInit();

    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    const internals = fixture.componentInstance as unknown as SheetInternals;
    internals.submit();

    expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ agendaItemId: 'item-3' }));
  });
});

describe('RoundStartSheetComponent — where the cursor starts', () => {
  beforeEach(() => {
    focusFieldMock.mockReset();
    focusFieldMock.mockResolvedValue(undefined);
    surface.mode = 'mobile';
  });

  async function open() {
    const mounted = await mount();
    mounted.fixture.detectChanges();
    await mounted.fixture.whenStable();
    return mounted;
  }

  it('in the title, where there is a keyboard to type it with', async () => {
    surface.mode = 'desktop';
    const { fixture } = await open();

    expect(focusFieldMock).toHaveBeenCalledOnce();
    // The first field of the form: what is being estimated
    const field = focusFieldMock.mock.calls[0]![0];
    const first = fixture.debugElement.query((el) => el.name === 'ion-input');
    expect(field).toBe(first.componentInstance);
    expect((first.nativeElement as HTMLElement).getAttribute('label')).toBe(
      'What are you estimating?',
    );
  });

  // Every field is optional. On a phone the keyboard would cover a form that
  // mostly goes out as it is.
  it('nowhere on a phone', async () => {
    await open();

    expect(focusFieldMock).not.toHaveBeenCalled();
  });
});

describe('RoundStartSheetComponent — Enter', () => {
  type Internals = { onEnter(e: Event): void };

  it('starts the round', async () => {
    const { fixture, submitted } = await mount();

    (fixture.componentInstance as unknown as Internals).onEnter(new KeyboardEvent('keydown'));

    expect(submitted).toHaveBeenCalledTimes(1);
  });

  // With an input method editor, Enter picks the candidate. It is part of
  // typing the title, not the end of it.
  it('does not start it while a composition is being confirmed', async () => {
    const { fixture, submitted } = await mount();

    (fixture.componentInstance as unknown as Internals).onEnter(
      new KeyboardEvent('keydown', { isComposing: true }),
    );

    expect(submitted).not.toHaveBeenCalled();
  });
});
