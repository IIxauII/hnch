import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { PageHeaderComponent } from './page-header.component';

// PageHeaderComponent has no Ionic imports — no mocks needed.

@Component({
  standalone: true,
  imports: [PageHeaderComponent],
  template: `<hnch-page-header title="T"><button trailing data-testid="trailing-btn">Edit</button></hnch-page-header>`,
})
class TrailingWrapperComponent {}

describe('PageHeaderComponent', () => {
  function create(inputs: { title: string; eyebrow?: string; subtitle?: string }) {
    const fixture = TestBed.createComponent(PageHeaderComponent);
    fixture.componentRef.setInput('title', inputs.title);
    if (inputs.eyebrow !== undefined) fixture.componentRef.setInput('eyebrow', inputs.eyebrow);
    if (inputs.subtitle !== undefined) fixture.componentRef.setInput('subtitle', inputs.subtitle);
    fixture.detectChanges();
    return fixture;
  }

  it('renders eyebrow only when set', () => {
    const f1 = create({ title: 'Test' });
    expect(f1.debugElement.query(By.css('.eyebrow'))).toBeNull();

    const f2 = create({ title: 'Test', eyebrow: 'Section' });
    const el = f2.debugElement.query(By.css('.eyebrow'));
    expect(el).not.toBeNull();
    expect(el.nativeElement.textContent.trim()).toBe('Section');
  });

  it('renders subtitle only when set', () => {
    const f1 = create({ title: 'Test' });
    expect(f1.debugElement.query(By.css('.subtitle'))).toBeNull();

    const f2 = create({ title: 'Test', subtitle: 'A description' });
    const el = f2.debugElement.query(By.css('.subtitle'));
    expect(el).not.toBeNull();
    expect(el.nativeElement.textContent.trim()).toBe('A description');
  });

  it('always renders the title', () => {
    const f = create({ title: 'My Title' });
    const el = f.debugElement.query(By.css('.title'));
    expect(el).not.toBeNull();
    expect(el.nativeElement.textContent.trim()).toBe('My Title');
  });

  it('projects trailing slot content', () => {
    const wrapperFixture = TestBed.createComponent(TrailingWrapperComponent);
    wrapperFixture.detectChanges();
    const btn = wrapperFixture.nativeElement.querySelector('[data-testid="trailing-btn"]');
    expect(btn).not.toBeNull();
    expect(btn.textContent.trim()).toBe('Edit');
  });
});
