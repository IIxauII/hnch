import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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
  let fixture: ComponentFixture<SectionCardComponent>;

  function create(inputs: { eyebrow?: string; title?: string }) {
    fixture = TestBed.createComponent(SectionCardComponent);
    if (inputs.eyebrow !== undefined) fixture.componentRef.setInput('eyebrow', inputs.eyebrow);
    if (inputs.title !== undefined) fixture.componentRef.setInput('title', inputs.title);
    fixture.detectChanges();
  }

  it('renders eyebrow only when set', () => {
    create({});
    expect(fixture.debugElement.query(By.css('.eyebrow'))).toBeNull();

    create({ eyebrow: 'Meta' });
    const el = fixture.debugElement.query(By.css('.eyebrow'));
    expect(el).not.toBeNull();
    expect(el.nativeElement.textContent.trim()).toBe('Meta');
  });

  it('renders title only when set', () => {
    create({});
    expect(fixture.debugElement.query(By.css('.section-title'))).toBeNull();

    create({ title: 'Card Title' });
    const el = fixture.debugElement.query(By.css('.section-title'));
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
