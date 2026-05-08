import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import type { ParticipantSnapshot } from '@hnch/shared';

// Stub Ionic components so @ionic/core ESM doesn't break vitest
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');

  @Comp({ selector: 'ion-item-sliding', template: '<ng-content />', standalone: true })
  class IonItemSliding {}

  @Comp({ selector: 'ion-item', template: '<ng-content />', standalone: true })
  class IonItem {
    @Input() lines?: string;
  }

  @Comp({ selector: 'ion-label', template: '<ng-content />', standalone: true })
  class IonLabel {}

  @Comp({ selector: 'ion-chip', template: '<ng-content />', standalone: true })
  class IonChip {
    @Input() color?: string;
    @Input() button?: boolean;
  }

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {
    @Input() name?: string;
    @Input() slot?: string;
  }

  @Comp({ selector: 'ion-item-options', template: '<ng-content />', standalone: true })
  class IonItemOptions {
    @Input() side?: string;
  }

  @Comp({ selector: 'ion-item-option', template: '<ng-content />', standalone: true })
  class IonItemOption {
    @Input() color?: string;
  }

  return { IonItemSliding, IonItem, IonLabel, IonChip, IonIcon, IonItemOptions, IonItemOption };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({
  personCircleOutline: '',
  personRemoveOutline: '',
  starOutline: '',
}));

import { ParticipantRowComponent } from './participant-row.component';

function makeParticipant(
  id: string,
  displayName: string,
  role?: 'voter' | 'viewer',
): ParticipantSnapshot {
  return { id, displayName, joinedAt: 0, role };
}

function create(opts: {
  participant: ParticipantSnapshot;
  isMe?: boolean;
  isHost?: boolean;
  canEditRole?: boolean;
  online?: boolean;
  canKick?: boolean;
}) {
  const fixture = TestBed.createComponent(ParticipantRowComponent);
  fixture.componentRef.setInput('participant', opts.participant);
  if (opts.isMe !== undefined) fixture.componentRef.setInput('isMe', opts.isMe);
  if (opts.isHost !== undefined) fixture.componentRef.setInput('isHost', opts.isHost);
  if (opts.canEditRole !== undefined)
    fixture.componentRef.setInput('canEditRole', opts.canEditRole);
  if (opts.online !== undefined) fixture.componentRef.setInput('online', opts.online);
  if (opts.canKick !== undefined) fixture.componentRef.setInput('canKick', opts.canKick);
  fixture.detectChanges();
  return fixture;
}

describe('ParticipantRowComponent', () => {
  it('renders participant name', () => {
    const f = create({ participant: makeParticipant('p1', 'Alice') });
    expect(f.nativeElement.textContent).toContain('Alice');
  });

  it('emits roleChange with "viewer" when voter chip clicked', () => {
    const f = create({
      participant: makeParticipant('p1', 'Alice', 'voter'),
      canEditRole: true,
    });
    const emitSpy = vi.spyOn(f.componentInstance.roleChange, 'emit');

    const chip = f.debugElement.query(By.css('ion-chip'));
    expect(chip).not.toBeNull();
    chip.triggerEventHandler('click', {});
    f.detectChanges();
    expect(emitSpy).toHaveBeenCalledWith('viewer');
  });

  it('emits roleChange with "voter" when viewer chip clicked', () => {
    const f = create({
      participant: makeParticipant('p1', 'Alice', 'viewer'),
      canEditRole: true,
    });
    const emitSpy = vi.spyOn(f.componentInstance.roleChange, 'emit');

    const chip = f.debugElement.query(By.css('ion-chip'));
    chip.triggerEventHandler('click', {});
    f.detectChanges();
    expect(emitSpy).toHaveBeenCalledWith('voter');
  });

  it('hides role chip when canEditRole is false', () => {
    const f = create({
      participant: makeParticipant('p1', 'Alice', 'voter'),
      canEditRole: false,
    });
    const chip = f.debugElement.query(By.css('ion-chip'));
    expect(chip).toBeNull();
  });

  it('emits kick when slide option clicked', () => {
    const f = create({
      participant: makeParticipant('p2', 'Bob'),
      canKick: true,
    });
    const kickSpy = vi.spyOn(f.componentInstance.kick, 'emit');

    const option = f.debugElement.query(By.css('ion-item-option'));
    expect(option).not.toBeNull();
    option.triggerEventHandler('click', {});
    f.detectChanges();
    expect(kickSpy).toHaveBeenCalledOnce();
  });

  it('does not render slide option when canKick is false', () => {
    const f = create({
      participant: makeParticipant('p1', 'Alice'),
      canKick: false,
    });
    expect(f.debugElement.query(By.css('ion-item-option'))).toBeNull();
  });
});
