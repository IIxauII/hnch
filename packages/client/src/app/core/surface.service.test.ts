/**
 * SurfaceService unit tests.
 *
 * Uses Angular TestBed to satisfy inject() context requirement.
 * Provides stub Ionic controllers via useValue (same pattern as
 * session-end.service.test.ts). Mocks window.matchMedia to exercise
 * mode detection and signal updates in isolation.
 *
 * @vitest-environment jsdom
 */

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Ionic module stubs (hoisted; no importOriginal — ESM-only pkg)
// These stubs only need to satisfy the module resolution; actual controller
// instances are provided via useValue below.
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', () => ({
  ModalController: class ModalController {},
  PopoverController: class PopoverController {},
  ActionSheetController: class ActionSheetController {},
  IonList: {},
  IonListHeader: {},
  IonItem: {},
  IonLabel: {},
  IonIcon: {},
}));

vi.mock('ionicons', () => ({ addIcons: () => {} }));
vi.mock('ionicons/icons', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import {
  ActionSheetController,
  ModalController,
  PopoverController,
} from '@ionic/angular/standalone';
import { SurfaceService } from './surface.service';

// ---------------------------------------------------------------------------
// matchMedia mock helpers
// ---------------------------------------------------------------------------

type MediaChangeHandler = (e: MediaQueryListEvent) => void;

let mediaChangeHandler: MediaChangeHandler | null = null;

function createMockMediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(min-width: 768px) and (pointer: fine)',
    addEventListener: vi.fn((_event: string, handler: MediaChangeHandler) => {
      mediaChangeHandler = handler;
    }),
    removeEventListener: vi.fn((_event: string, _handler: MediaChangeHandler) => {
      mediaChangeHandler = null;
    }),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;
}

function simulateMediaChange(matches: boolean): void {
  if (mediaChangeHandler) {
    mediaChangeHandler({ matches } as MediaQueryListEvent);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SurfaceService', () => {
  let mql: MediaQueryList;

  const modalCtrlStub = { create: vi.fn() };
  const popoverCtrlStub = { create: vi.fn() };
  const actionSheetCtrlStub = { create: vi.fn() };

  function setup(matches: boolean): SurfaceService {
    mql = createMockMediaQueryList(matches);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql);

    TestBed.configureTestingModule({
      providers: [
        SurfaceService,
        { provide: ModalController, useValue: modalCtrlStub },
        { provide: PopoverController, useValue: popoverCtrlStub },
        { provide: ActionSheetController, useValue: actionSheetCtrlStub },
      ],
    });
    return TestBed.inject(SurfaceService);
  }

  beforeEach(() => {
    mediaChangeHandler = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('reports mobile when matchMedia does not match', () => {
    const svc = setup(false);
    expect(svc.mode()).toBe('mobile');
  });

  it('reports desktop when matchMedia matches', () => {
    const svc = setup(true);
    expect(svc.mode()).toBe('desktop');
  });

  it('updates mode to desktop when media query fires matches=true', () => {
    const svc = setup(false);
    expect(svc.mode()).toBe('mobile');

    simulateMediaChange(true);
    expect(svc.mode()).toBe('desktop');
  });

  it('updates mode to mobile when media query fires matches=false', () => {
    const svc = setup(true);
    expect(svc.mode()).toBe('desktop');

    simulateMediaChange(false);
    expect(svc.mode()).toBe('mobile');
  });

  it('attaches a change listener on construction', () => {
    setup(false);
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
