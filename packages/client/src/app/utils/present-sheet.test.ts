import { describe, expect, it, vi } from 'vitest';

import { presentSheet } from './present-sheet';

function makeModal(dismissData: { data?: unknown; role?: string } = {}): {
  present: ReturnType<typeof vi.fn>;
  onDidDismiss: ReturnType<typeof vi.fn>;
} {
  return {
    present: vi.fn().mockResolvedValue(undefined),
    onDidDismiss: vi.fn().mockResolvedValue(dismissData),
  };
}

describe('presentSheet', () => {
  it('restores focus to the previously focused element after dismiss', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);

    const modal = makeModal();
    await presentSheet({ modal: modal as any });

    expect(document.activeElement).toBe(button);
    document.body.removeChild(button);
  });

  it('returns the didDismiss result', async () => {
    const modal = makeModal({ data: { foo: 'bar' }, role: 'confirm' });
    const result = await presentSheet({ modal: modal as any });
    expect(result).toEqual({ data: { foo: 'bar' }, role: 'confirm' });
  });

  it('calls present() then onDidDismiss() in order', async () => {
    const order: string[] = [];
    const modal = {
      present: vi.fn().mockImplementation(async () => {
        order.push('present');
      }),
      onDidDismiss: vi.fn().mockImplementation(async () => {
        order.push('dismiss');
        return {};
      }),
    };
    await presentSheet({ modal: modal as any });
    expect(order).toEqual(['present', 'dismiss']);
  });

  it('does not throw when invoking element removed before dismiss', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();

    // Remove from DOM before dismiss fires.
    document.body.removeChild(button);

    const modal = makeModal();
    await expect(presentSheet({ modal: modal as any })).resolves.not.toThrow();
  });

  it('does not throw when no element was focused', async () => {
    // Blur any active element.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const modal = makeModal();
    await expect(presentSheet({ modal: modal as any })).resolves.not.toThrow();
  });
});
