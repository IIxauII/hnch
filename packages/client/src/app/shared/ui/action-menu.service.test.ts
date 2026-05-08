import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Must mock before importing service — vi.mock is hoisted
vi.mock('@ionic/angular/standalone', () => ({
  ActionSheetController: class MockActionSheetController {},
}));

import { ActionSheetController } from '@ionic/angular/standalone';
import { ActionMenuService } from './action-menu.service';

describe('ActionMenuService', () => {
  let service: ActionMenuService;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCreate = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ActionMenuService,
        {
          provide: ActionSheetController,
          useValue: { create: mockCreate },
        },
      ],
    });
    service = TestBed.inject(ActionMenuService);
  });

  function makeSheet(dismissResult: { data?: string; role?: string }) {
    const sheet = {
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue(dismissResult),
    };
    mockCreate.mockResolvedValue(sheet);
    return sheet;
  }

  it('returns null on cancel', async () => {
    makeSheet({ role: 'cancel' });
    const result = await service.open([{ id: 'foo', label: 'Foo' }]);
    expect(result).toBeNull();
  });

  it('returns null on backdrop dismiss', async () => {
    makeSheet({ role: 'backdrop' });
    const result = await service.open([{ id: 'foo', label: 'Foo' }]);
    expect(result).toBeNull();
  });

  it('returns null when data is undefined', async () => {
    makeSheet({ role: 'selected', data: undefined });
    const result = await service.open([{ id: 'bar', label: 'Bar' }]);
    expect(result).toBeNull();
  });

  it('returns selected item id', async () => {
    makeSheet({ role: 'selected', data: 'my-item' });
    const result = await service.open([
      { id: 'my-item', label: 'My Item' },
      { id: 'other', label: 'Other' },
    ]);
    expect(result).toBe('my-item');
  });
});
