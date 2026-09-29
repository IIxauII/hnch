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
    expect(voter.getAttribute('aria-label')).toBe('Voter. Switch to observer.');

    const observer = (await mount(true)).button;
    expect(observer.getAttribute('title')).toBe('Switch to voter');
    expect(observer.getAttribute('aria-label')).toBe('Observer. Switch to voter.');
  });

  // Speech input finds a control by the word on it ("click Voter").
  it('starts its name with the word it shows', async () => {
    for (const viewer of [false, true]) {
      const { button } = await mount(viewer);
      const shown = button.textContent!.trim();
      expect(button.getAttribute('aria-label')!.startsWith(shown)).toBe(true);
    }
  });

  // A pressed toggle keeps its name and changes state. This one changes its
  // name, so a state on top would say the same thing twice, differently.
  it('is not announced as a pressed toggle', async () => {
    expect((await mount(false)).button.hasAttribute('aria-pressed')).toBe(false);
    expect((await mount(true)).button.hasAttribute('aria-pressed')).toBe(false);
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
