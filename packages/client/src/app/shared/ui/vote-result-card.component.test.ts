import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';

// Stub Ionic components
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');

  @Comp({ selector: 'ion-item-group', template: '<ng-content />', standalone: true })
  class IonItemGroup {}

  @Comp({ selector: 'ion-chip', template: '<ng-content />', standalone: true })
  class IonChip {
    @Input() color?: string;
  }

  @Comp({ selector: 'ion-label', template: '<ng-content />', standalone: true })
  class IonLabel {}

  return { IonItemGroup, IonChip, IonLabel };
});

import { VoteResultCardComponent } from './vote-result-card.component';

function create(opts: {
  card: string;
  voters: readonly string[];
  isWinner?: boolean;
  isMyVote?: boolean;
}) {
  const fixture = TestBed.createComponent(VoteResultCardComponent);
  fixture.componentRef.setInput('card', opts.card);
  fixture.componentRef.setInput('voters', opts.voters);
  if (opts.isWinner !== undefined) fixture.componentRef.setInput('isWinner', opts.isWinner);
  if (opts.isMyVote !== undefined) fixture.componentRef.setInput('isMyVote', opts.isMyVote);
  fixture.detectChanges();
  return fixture;
}

describe('VoteResultCardComponent', () => {
  it('renders the card glyph', () => {
    const f = create({ card: '8', voters: ['Alice', 'Bob'] });
    const glyph = f.debugElement.query(By.css('.card-glyph'));
    expect(glyph).not.toBeNull();
    expect(glyph.nativeElement.textContent.trim()).toBe('8');
  });

  it('renders voter count label', () => {
    const f = create({ card: '5', voters: ['Alice', 'Bob', 'Carlos'] });
    expect(f.nativeElement.textContent).toContain('3 votes');
  });

  it('renders singular vote count for one voter', () => {
    const f = create({ card: '13', voters: ['Alice'] });
    expect(f.nativeElement.textContent).toContain('1 vote');
  });

  it('applies winner class when isWinner is true', () => {
    const f = create({ card: '8', voters: ['Alice'], isWinner: true });
    const group = f.debugElement.query(By.css('.result-group'));
    expect(group.classes['winner']).toBe(true);
  });

  it('does not apply winner class when isWinner is false', () => {
    const f = create({ card: '8', voters: ['Alice'], isWinner: false });
    const group = f.debugElement.query(By.css('.result-group'));
    expect(group.classes['winner']).toBeFalsy();
  });

  it('applies my-vote class when isMyVote is true', () => {
    const f = create({ card: '3', voters: ['You (Alice)'], isMyVote: true });
    const group = f.debugElement.query(By.css('.result-group'));
    expect(group.classes['my-vote']).toBe(true);
  });

  it('renders one chip per voter', () => {
    const f = create({ card: '5', voters: ['Alice', 'Bob'] });
    const chips = f.debugElement.queryAll(By.css('ion-chip'));
    expect(chips.length).toBe(2);
  });
});
