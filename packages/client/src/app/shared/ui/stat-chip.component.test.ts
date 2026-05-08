import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { StatChipComponent, type StatChipTone } from './stat-chip.component';

describe('StatChipComponent', () => {
  let fixture: ComponentFixture<StatChipComponent>;

  function create(inputs: { label: string; value: string; tone?: StatChipTone; icon?: string }) {
    fixture = TestBed.createComponent(StatChipComponent);
    fixture.componentRef.setInput('label', inputs.label);
    fixture.componentRef.setInput('value', inputs.value);
    if (inputs.tone !== undefined) fixture.componentRef.setInput('tone', inputs.tone);
    if (inputs.icon !== undefined) fixture.componentRef.setInput('icon', inputs.icon);
    fixture.detectChanges();
  }

  const tones: StatChipTone[] = ['neutral', 'success', 'warning', 'danger'];

  it.each(tones)('renders tone %s without errors', (tone) => {
    create({ label: 'Score', value: '42', tone });
    const chip = fixture.debugElement.query(By.css('.stat-chip'));
    expect(chip).not.toBeNull();
  });

  it('renders label and value', () => {
    create({ label: 'Avg', value: '8.5' });
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Avg');
    expect(text).toContain('8.5');
  });

  it('renders icon when provided', () => {
    create({ label: 'Status', value: 'OK', icon: 'checkmark-circle-outline' });
    const icon = fixture.debugElement.query(By.css('ion-icon'));
    expect(icon).not.toBeNull();
  });

  it('omits icon when not provided', () => {
    create({ label: 'Status', value: 'OK' });
    const icon = fixture.debugElement.query(By.css('ion-icon'));
    expect(icon).toBeNull();
  });
});
