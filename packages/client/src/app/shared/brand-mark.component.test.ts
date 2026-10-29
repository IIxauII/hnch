// Exercises: shared/brand-mark.component:BrandMarkComponent

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { BrandMarkComponent } from './brand-mark.component';

function mount(size?: number) {
  const fixture = TestBed.createComponent(BrandMarkComponent);
  if (size !== undefined) fixture.componentRef.setInput('size', size);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    tile: el.querySelector<HTMLElement>('.brand-tile')!,
    svg: el.querySelector('svg')!,
    curve: el.querySelector('path.curve')!,
    spark: el.querySelector('circle.spark')!,
  };
}

describe('BrandMarkComponent', () => {
  it('is decorative: hidden from assistive tech', () => {
    expect(mount().tile.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to a 56px tile', () => {
    const { tile, svg } = mount();
    expect(tile.style.width).toBe('56px');
    expect(tile.style.height).toBe('56px');
    expect(svg.getAttribute('width')).toBe('45');
  });

  it('scales the tile radius and glyph with size', () => {
    const { tile, svg } = mount(64);
    expect(tile.style.borderRadius).toBe('14px');
    expect(svg.getAttribute('width')).toBe('51');
    expect(svg.getAttribute('height')).toBe('51');
  });

  it('uses the regular stroke at larger sizes', () => {
    const { curve, spark } = mount(64);
    expect(curve.getAttribute('stroke-width')).toBe('9');
    expect(spark.getAttribute('r')).toBe('8');
  });

  it('uses a heavier stroke at small sizes so the mark stays legible', () => {
    const { curve, spark } = mount(32);
    expect(curve.getAttribute('stroke-width')).toBe('11');
    expect(spark.getAttribute('r')).toBe('10');
  });
});
