/**
 * Real-DocService coverage for the round-command terminal wrappers.
 *
 * The main `doc.service.test.ts` uses a hand-rolled harness (no TestBed) and so
 * cannot exercise the service's own `revealCurrentRound` / `skipCurrentRound` /
 * `discardCurrentRound` wrappers. Here we inject the real service and assert the
 * wrappers return the shared `TerminalResult` and apply the doc effect.
 *
 * DocService transitively imports `ToastService`, which pulls `ToastController`
 * from `@ionic/angular/standalone` — mocked below so the ESM-only `@ionic/core`
 * chain never loads under vitest. The wrappers' only real dependency is an
 * attached `Y.Doc` (via `createSession`).
 */

import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FIBONACCI_SCALE } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class {
    create = vi.fn().mockResolvedValue({ present: vi.fn() });
  },
}));

import { DocService } from './doc.service';
import { AppPreferenceService } from '../app-preference.service';
import { ToastService } from '../../services/toast.service';

const NOW = 1_700_000_000_000;

describe('DocService — round-command wrappers', () => {
  let svc: DocService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DocService,
        { provide: AppPreferenceService, useValue: { relayWsUrl: () => null } },
        { provide: ToastService, useValue: {} },
      ],
    });
    svc = TestBed.inject(DocService);
    svc.createSession({
      participantId: 'p-host',
      displayName: 'Host',
      defaultScale: FIBONACCI_SCALE,
      roomUuid: 'room-uuid-1',
      roomCode: 'ABC123',
      now: () => NOW,
    });
  });

  afterEach(() => {
    svc.endSession();
  });

  it('revealCurrentRound reveals the active round → applied + doc effect', () => {
    svc.startRound({}, { now: () => NOW });
    const result = svc.revealCurrentRound({ now: () => NOW + 1000 });
    expect(result).toEqual({ applied: true, at: NOW + 1000 });
    expect(svc.rounds()[0]?.status).toBe('revealed');
    expect(svc.rounds()[0]?.terminalAt).toBe(NOW + 1000);
  });

  it('skipCurrentRound skips the active round → applied + doc effect', () => {
    svc.startRound({}, { now: () => NOW });
    const result = svc.skipCurrentRound();
    expect(result.applied).toBe(true);
    expect(svc.rounds()[0]?.status).toBe('skipped');
  });

  it('discardCurrentRound discards the active round → applied + tombstone', () => {
    svc.startRound({}, { now: () => NOW });
    const result = svc.discardCurrentRound('p-host');
    expect(result.applied).toBe(true);
    // Discarded rounds are tombstones — excluded from currentRound().
    expect(svc.rounds()[0]?.status).toBe('discarded');
    expect(svc.currentRound()).toBeNull();
  });

  it('no-ops with no-current-round when no round exists', () => {
    expect(svc.revealCurrentRound()).toEqual({ applied: false, reason: 'no-current-round' });
    expect(svc.skipCurrentRound()).toEqual({ applied: false, reason: 'no-current-round' });
    expect(svc.discardCurrentRound('p-host')).toEqual({
      applied: false,
      reason: 'no-current-round',
    });
  });
});
