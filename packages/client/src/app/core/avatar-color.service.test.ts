/**
 * AvatarColorService unit tests (ADR-0043).
 *
 * @vitest-environment jsdom
 */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCENTS, AVATAR_PALETTE_KEYS, deterministicAvatarColor } from '@hnch/shared';

const { mockPreferences } = vi.hoisted(() => ({
  mockPreferences: {
    get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
    set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

import { AvatarColorService } from './avatar-color.service';
import { ParticipantIdService } from './participant-id.service';

class StubParticipantIdService {
  private cached: string | null = null;
  setId(id: string): void {
    this.cached = id;
  }
  getOrCreateId(): Promise<string> {
    return Promise.resolve(this.cached ?? 'device-stub');
  }
  ensureLoaded(): Promise<string> {
    return this.getOrCreateId();
  }
}

function setUp(deviceId: string) {
  TestBed.resetTestingModule();
  const stub = new StubParticipantIdService();
  stub.setId(deviceId);
  TestBed.configureTestingModule({
    providers: [AvatarColorService, { provide: ParticipantIdService, useValue: stub }],
  });
  return TestBed.inject(AvatarColorService);
}

beforeEach(() => {
  mockPreferences.get.mockReset();
  mockPreferences.set.mockReset();
  mockPreferences.set.mockResolvedValue(undefined);
});

describe('AvatarColorService.ensureLoaded', () => {
  it('returns stored AccentKey when present and valid', async () => {
    mockPreferences.get.mockResolvedValueOnce({ value: 'blue' });
    const svc = setUp('device-a');
    const v = await svc.ensureLoaded();
    expect(v).toBe('blue');
    expect(svc.value()).toBe('blue');
    expect(mockPreferences.set).not.toHaveBeenCalled();
  });

  it('returns stored #rrggbb when present and valid', async () => {
    mockPreferences.get.mockResolvedValueOnce({ value: '#abcdef' });
    const svc = setUp('device-a');
    expect(await svc.ensureLoaded()).toBe('#abcdef');
    expect(mockPreferences.set).not.toHaveBeenCalled();
  });

  it('seeds deterministically and persists when storage empty', async () => {
    mockPreferences.get.mockResolvedValueOnce({ value: null });
    const svc = setUp('device-deterministic-1');
    const v = await svc.ensureLoaded();
    expect(v).toBe(deterministicAvatarColor('device-deterministic-1'));
    expect(AVATAR_PALETTE_KEYS).toContain(v);
    expect(mockPreferences.set).toHaveBeenCalledWith({
      key: AvatarColorService.PREF_KEY,
      value: v,
    });
  });

  it('seeds deterministically when storage has invalid value', async () => {
    mockPreferences.get.mockResolvedValueOnce({ value: 'garbage-value' });
    const svc = setUp('device-x');
    const v = await svc.ensureLoaded();
    expect(v).toBe(deterministicAvatarColor('device-x'));
    expect(mockPreferences.set).toHaveBeenCalled();
  });

  it('shares an in-flight promise across concurrent callers', async () => {
    let resolveGet!: (v: { value: string | null }) => void;
    mockPreferences.get.mockReturnValueOnce(
      new Promise((res) => {
        resolveGet = res;
      }),
    );
    const svc = setUp('device-a');
    const p1 = svc.ensureLoaded();
    const p2 = svc.ensureLoaded();
    resolveGet({ value: 'green' });
    const [v1, v2] = await Promise.all([p1, p2]);
    expect(v1).toBe('green');
    expect(v2).toBe('green');
    expect(mockPreferences.get).toHaveBeenCalledTimes(1);
  });
});

describe('AvatarColorService.setValue', () => {
  it('persists palette key and updates signal', async () => {
    mockPreferences.get.mockResolvedValueOnce({ value: 'blue' });
    const svc = setUp('device-a');
    await svc.ensureLoaded();
    await svc.setValue('red');
    expect(mockPreferences.set).toHaveBeenLastCalledWith({
      key: AvatarColorService.PREF_KEY,
      value: 'red',
    });
    expect(svc.value()).toBe('red');
  });

  it('persists valid hex literals', async () => {
    mockPreferences.get.mockResolvedValueOnce({ value: 'blue' });
    const svc = setUp('device-a');
    await svc.ensureLoaded();
    await svc.setValue('#123456');
    expect(svc.value()).toBe('#123456');
    expect(mockPreferences.set).toHaveBeenLastCalledWith({
      key: AvatarColorService.PREF_KEY,
      value: '#123456',
    });
  });

  it('rejects invalid input and does not persist', async () => {
    mockPreferences.get.mockResolvedValueOnce({ value: 'blue' });
    const svc = setUp('device-a');
    await svc.ensureLoaded();
    await expect(svc.setValue('not-a-color')).rejects.toThrow(/invalid color/);
    expect(svc.value()).toBe('blue');
    // The seed-on-load set call counts; the bad set should not have added another.
    expect(mockPreferences.set.mock.calls.filter((c) => c[0].value === 'not-a-color').length).toBe(
      0,
    );
  });
});

describe('deterministic-first-launch stability (issue #159 AC #5)', () => {
  it('two cold launches with the same deviceId yield the same color', async () => {
    mockPreferences.get.mockResolvedValueOnce({ value: null });
    const svc1 = setUp('device-stable');
    const first = await svc1.ensureLoaded();

    mockPreferences.get.mockResolvedValueOnce({ value: first });
    const svc2 = setUp('device-stable');
    const second = await svc2.ensureLoaded();

    expect(second).toBe(first);
    // Sanity: the first hex matches the ACCENTS entry for the deterministic key.
    expect(ACCENTS[deterministicAvatarColor('device-stable')].base).toBe(
      ACCENTS[first as never].base,
    );
  });
});
