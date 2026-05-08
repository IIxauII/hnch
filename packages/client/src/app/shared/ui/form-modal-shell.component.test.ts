import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Must mock before importing component
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input, EventEmitter } = await import('@angular/core');

  @Comp({ selector: 'ion-header', template: '<ng-content />', standalone: true })
  class IonHeader {}

  @Comp({ selector: 'ion-toolbar', template: '<ng-content />', standalone: true })
  class IonToolbar {}

  @Comp({ selector: 'ion-title', template: '<ng-content />', standalone: true })
  class IonTitle {}

  @Comp({ selector: 'ion-buttons', template: '<ng-content />', standalone: true })
  class IonButtons {
    @Input() slot?: string;
  }

  @Comp({ selector: 'ion-button', template: '<ng-content />', standalone: true })
  class IonButton {
    @Input() fill?: string;
    @Input() color?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clicked = new EventEmitter<any>();
  }

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {
    @Input() name?: string;
    @Input() slot?: string;
  }

  @Comp({ selector: 'ion-content', template: '<ng-content />', standalone: true })
  class IonContent {}

  @Comp({ selector: 'ion-footer', template: '<ng-content />', standalone: true })
  class IonFooter {}

  class ModalController {
    dismiss = vi.fn().mockResolvedValue(undefined);
  }

  return {
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonFooter,
    ModalController,
  };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ closeOutline: '' }));

import { ModalController } from '@ionic/angular/standalone';
import { FormModalShellComponent } from './form-modal-shell.component';

@Component({
  standalone: true,
  imports: [FormModalShellComponent],
  template: `
    <hnch-form-modal-shell title="Edit item">
      <p data-testid="body">Form body</p>
    </hnch-form-modal-shell>
  `,
})
class DefaultFooterWrapperComponent {}

describe('FormModalShellComponent', () => {
  let mockModalCtrl: { dismiss: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockModalCtrl = { dismiss: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [{ provide: ModalController, useValue: mockModalCtrl }],
    });
  });

  it('renders the title', () => {
    const f = TestBed.createComponent(FormModalShellComponent);
    f.componentRef.setInput('title', 'My Modal');
    f.detectChanges();
    const title = f.debugElement.query(By.css('.modal-title'));
    expect(title).not.toBeNull();
    expect(title.nativeElement.textContent.trim()).toBe('My Modal');
  });

  it('projects default content slot', () => {
    const f = TestBed.createComponent(DefaultFooterWrapperComponent);
    f.detectChanges();
    const body = f.nativeElement.querySelector('[data-testid="body"]');
    expect(body).not.toBeNull();
    expect(body.textContent.trim()).toBe('Form body');
  });

  it('uses submitLabel input for submit button', () => {
    const f = TestBed.createComponent(FormModalShellComponent);
    f.componentRef.setInput('title', 'T');
    f.componentRef.setInput('submitLabel', 'Confirm');
    f.detectChanges();
    const text = f.nativeElement.textContent;
    expect(text).toContain('Confirm');
  });

  it('emits submit when default footer submit button clicked', () => {
    const f = TestBed.createComponent(FormModalShellComponent);
    f.componentRef.setInput('title', 'T');
    f.detectChanges();

    const emitSpy = vi.spyOn(f.componentInstance.submit, 'emit');

    // Find all ion-button elements and trigger Angular click binding on
    // the one with "Save" text (the submit button in default footer)
    const buttons = f.debugElement.queryAll(By.css('ion-button'));
    const submitBtn = buttons.find((b) => b.nativeElement.textContent.trim() === 'Save');
    expect(submitBtn).not.toBeNull();
    submitBtn!.triggerEventHandler('click', {});
    f.detectChanges();
    expect(emitSpy).toHaveBeenCalledOnce();
  });
});
