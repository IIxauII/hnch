import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import type { StatChipTone } from './stat-chip.component';

// Stub Ionic + ionicons so @ionic/core ESM doesn't break vitest
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');

  @Comp({ selector: 'ion-chip', template: '<ng-content />', standalone: true })
  class IonChip {
    @Input() color?: string;
  }

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {
    @Input() name?: string;
  }

  @Comp({ selector: 'ion-label', template: '<ng-content />', standalone: true })
  class IonLabel {}

  return { IonChip, IonIcon, IonLabel };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({
  checkmarkCircleOutline: '',
  alertCircleOutline: '',
  closeCircleOutline: '',
  ellipseOutline: '',
}));

import { StatChipComponent } from './stat-chip.component';

describe('StatChipComponent', () => {
  function create(inputs: { label: string; value: string; tone?: StatChipTone; icon?: string }) {
    const fixture = TestBed.createComponent(StatChipComponent);
    fixture.componentRef.setInput('label', inputs.label);
    fixture.componentRef.setInput('value', inputs.value);
    if (inputs.tone !== undefined) fixture.componentRef.setInput('tone', inputs.tone);
    if (inputs.icon !== undefined) fixture.componentRef.setInput('icon', inputs.icon);
    fixture.detectChanges();
    return fixture;
  }

  const tones: StatChipTone[] = ['neutral', 'success', 'warning', 'danger'];

  it.each(tones)('renders tone %s without errors', (tone) => {
    const f = create({ label: 'Score', value: '42', tone });
    const chip = f.debugElement.query(By.css('.stat-chip'));
    expect(chip).not.toBeNull();
  });

  it('renders label and value', () => {
    const f = create({ label: 'Avg', value: '8.5' });
    const text = f.nativeElement.textContent;
    expect(text).toContain('Avg');
    expect(text).toContain('8.5');
  });

  it('renders icon when provided', () => {
    const f = create({ label: 'Status', value: 'OK', icon: 'checkmark-circle-outline' });
    const icon = f.debugElement.query(By.css('ion-icon'));
    expect(icon).not.toBeNull();
  });

  it('omits icon when not provided', () => {
    const f = create({ label: 'Status', value: 'OK' });
    const icon = f.debugElement.query(By.css('ion-icon'));
    expect(icon).toBeNull();
  });
});
