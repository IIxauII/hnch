import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';

// Stub Ionic components so @ionic/core ESM doesn't break vitest
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');

  @Comp({ selector: 'ion-card', template: '<ng-content />', standalone: true })
  class IonCard {}

  @Comp({ selector: 'ion-card-header', template: '<ng-content />', standalone: true })
  class IonCardHeader {}

  @Comp({ selector: 'ion-card-content', template: '<ng-content />', standalone: true })
  class IonCardContent {}

  @Comp({ selector: 'ion-card-title', template: '<ng-content />', standalone: true })
  class IonCardTitle {}

  return { IonCard, IonCardHeader, IonCardContent, IonCardTitle };
});

import { SectionCardComponent } from './section-card.component';

@Component({
  standalone: true,
  imports: [SectionCardComponent],
  template: `
    <hnch-section-card eyebrow="Section" title="Title">
      <p>Body content</p>
      <div footer data-testid="footer-slot">Footer here</div>
    </hnch-section-card>
  `,
})
class FullWrapperComponent {}

describe('SectionCardComponent', () => {
  function create(inputs: { eyebrow?: string; title?: string }) {
    const fixture = TestBed.createComponent(SectionCardComponent);
    if (inputs.eyebrow !== undefined) fixture.componentRef.setInput('eyebrow', inputs.eyebrow);
    if (inputs.title !== undefined) fixture.componentRef.setInput('title', inputs.title);
    fixture.detectChanges();
    return fixture;
  }

  it('renders eyebrow only when set', () => {
    const f1 = create({});
    expect(f1.debugElement.query(By.css('.eyebrow'))).toBeNull();

    const f2 = create({ eyebrow: 'Meta' });
    const el = f2.debugElement.query(By.css('.eyebrow'));
    expect(el).not.toBeNull();
    expect(el.nativeElement.textContent.trim()).toBe('Meta');
  });

  it('renders title only when set', () => {
    const f1 = create({});
    expect(f1.debugElement.query(By.css('.section-title'))).toBeNull();

    const f2 = create({ title: 'Card Title' });
    const el = f2.debugElement.query(By.css('.section-title'));
    expect(el).not.toBeNull();
    expect(el.nativeElement.textContent.trim()).toBe('Card Title');
  });

  it('projects footer slot', () => {
    const wrapperFixture = TestBed.createComponent(FullWrapperComponent);
    wrapperFixture.detectChanges();
    const footer = wrapperFixture.nativeElement.querySelector('[data-testid="footer-slot"]');
    expect(footer).not.toBeNull();
    expect(footer.textContent.trim()).toBe('Footer here');
  });
});
