// Exercises: shared/role-toggle.component:RoleToggleComponent

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');

  @Comp({ selector: 'ion-button', template: '<ng-content/>', standalone: true })
  class IonButton {
    @Input() shape: string | undefined;
    @Input() size: string | undefined;
  }

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {
    @Input() name: string | undefined;
  }

  return { IonButton, IonIcon };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));

async function mount(viewer: boolean) {
  const { RoleToggleComponent } = await import('./role-toggle.component');
  const fixture = TestBed.createComponent(RoleToggleComponent);
  fixture.componentRef.setInput('viewer', viewer);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector('ion-button')!;
  return { fixture, button };
}

describe('RoleToggleComponent', () => {
  it('names the role the participant holds right now', async () => {
    expect((await mount(false)).button.textContent?.trim()).toBe('Voter');
    expect((await mount(true)).button.textContent?.trim()).toBe('Observer');
  });

  it('says where a press leads, for pointer and for screen reader alike', async () => {
    const voter = (await mount(false)).button;
    expect(voter.getAttribute('title')).toBe('Switch to observer');
    expect(voter.getAttribute('aria-label')).toBe('You are a voter. Switch to observer.');

    const observer = (await mount(true)).button;
    expect(observer.getAttribute('title')).toBe('Switch to voter');
    expect(observer.getAttribute('aria-label')).toBe('You are observing. Switch to voter.');
  });

  it('exposes the observer state as a pressed toggle', async () => {
    expect((await mount(false)).button.getAttribute('aria-pressed')).toBe('false');
    expect((await mount(true)).button.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks the observer state for styling', async () => {
    expect((await mount(false)).button.classList).not.toContain('role-toggle--observer');
    expect((await mount(true)).button.classList).toContain('role-toggle--observer');
  });

  it('emits and leaves the write to its parent', async () => {
    const { fixture, button } = await mount(false);
    const toggled = vi.fn();
    fixture.componentInstance.toggled.subscribe(toggled);

    button.click();

    expect(toggled).toHaveBeenCalledOnce();
    // Still "Voter": the label follows the input, not the click.
    expect(button.textContent?.trim()).toBe('Voter');
  });
});
