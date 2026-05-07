/**
 * Unit tests for ExportService.
 *
 * Mocks @capacitor/core (Capacitor.isNativePlatform) and @capacitor/clipboard
 * (Clipboard.write) plus navigator.clipboard to keep tests hermetic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundExportInput } from '@hnch/shared';

// ---------------------------------------------------------------------------
// Mock @capacitor/core
// ---------------------------------------------------------------------------

const mockIsNativePlatform = vi.fn<() => boolean>();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNativePlatform(),
  },
}));

// ---------------------------------------------------------------------------
// Mock @capacitor/clipboard
// ---------------------------------------------------------------------------

const mockClipboardWrite = vi.fn<(opts: { string: string }) => Promise<void>>();

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: {
    write: (opts: { string: string }) => mockClipboardWrite(opts),
  },
}));

// ---------------------------------------------------------------------------
// Stub roundsToMarkdown so tests don't depend on shared logic
// ---------------------------------------------------------------------------

vi.mock('@hnch/shared', () => ({
  roundsToMarkdown: (_input: RoundExportInput) => 'stub-markdown',
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createService() {
  const mod = await import('./export.service');
  return new mod.ExportService();
}

const minimalInput: RoundExportInput = {
  rounds: [],
  participants: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportService', () => {
  beforeEach(() => {
    mockIsNativePlatform.mockReset();
    mockClipboardWrite.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('native platform → calls Clipboard.write once with the markdown string', async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockClipboardWrite.mockResolvedValue(undefined);

    const svc = await createService();
    await svc.copyRoundsAsMarkdown(minimalInput);

    expect(mockClipboardWrite).toHaveBeenCalledOnce();
    expect(mockClipboardWrite).toHaveBeenCalledWith({ string: 'stub-markdown' });
  });

  it('web platform → calls navigator.clipboard.writeText once', async () => {
    mockIsNativePlatform.mockReturnValue(false);

    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      writable: true,
      configurable: true,
    });

    const svc = await createService();
    await svc.copyRoundsAsMarkdown(minimalInput);

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('stub-markdown');
  });

  it('web platform → writeText rejection bubbles up', async () => {
    mockIsNativePlatform.mockReturnValue(false);

    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new DOMException('NotAllowedError'));
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      writable: true,
      configurable: true,
    });

    const svc = await createService();
    await expect(svc.copyRoundsAsMarkdown(minimalInput)).rejects.toThrow('NotAllowedError');
  });
});
