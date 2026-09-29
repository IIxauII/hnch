// Exercises: toast.service:ToastService

import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class ToastController {},
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { ToastController } from '@ionic/angular/standalone';
import { ToastService } from './toast.service';

function makeToastControllerStub() {
  const presentMock = vi.fn().mockResolvedValue(undefined);
  const toastMock = { present: presentMock };
  const createMock = vi.fn().mockResolvedValue(toastMock);
  return { stub: { create: createMock }, toastMock, createMock, presentMock };
}

describe('ToastService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  describe('info()', () => {
    it('creates a toast with 2 s duration at top position', async () => {
      const { stub, createMock } = makeToastControllerStub();
      TestBed.configureTestingModule({
        providers: [ToastService, { provide: ToastController, useValue: stub }],
      });
      const svc = TestBed.inject(ToastService);

      await svc.info('hello world');

      expect(createMock).toHaveBeenCalledWith({
        message: 'hello world',
        duration: 2000,
        position: 'top',
      });
    });

    it('presents the created toast', async () => {
      const { stub, presentMock } = makeToastControllerStub();
      TestBed.configureTestingModule({
        providers: [ToastService, { provide: ToastController, useValue: stub }],
      });
      const svc = TestBed.inject(ToastService);

      await svc.info('hello');

      expect(presentMock).toHaveBeenCalledOnce();
    });
  });

  describe('error()', () => {
    it('creates a toast with 4 s duration at top position and a close button by default', async () => {
      const { stub, createMock } = makeToastControllerStub();
      TestBed.configureTestingModule({
        providers: [ToastService, { provide: ToastController, useValue: stub }],
      });
      const svc = TestBed.inject(ToastService);

      await svc.error('something went wrong');

      expect(createMock).toHaveBeenCalledWith({
        message: 'something went wrong',
        duration: 4000,
        position: 'top',
        buttons: [{ icon: 'close', role: 'cancel', htmlAttributes: { 'aria-label': 'Dismiss' } }],
      });
    });

    it('registers the close icon the dismiss button names', async () => {
      const { stub } = makeToastControllerStub();
      TestBed.configureTestingModule({
        providers: [ToastService, { provide: ToastController, useValue: stub }],
      });
      TestBed.inject(ToastService);

      // `addIcons` writes to the registry ionicons keeps on `window`.
      const registry = (window as unknown as { Ionicons?: { map?: Map<string, string> } }).Ionicons;
      expect(registry?.map?.get('close')).toBeTruthy();
    });

    it('omits close button when closeIcon: false is passed', async () => {
      const { stub, createMock } = makeToastControllerStub();
      TestBed.configureTestingModule({
        providers: [ToastService, { provide: ToastController, useValue: stub }],
      });
      const svc = TestBed.inject(ToastService);

      await svc.error('oops', { closeIcon: false });

      const callArg = createMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArg['buttons']).toBeUndefined();
    });

    it('presents the created toast', async () => {
      const { stub, presentMock } = makeToastControllerStub();
      TestBed.configureTestingModule({
        providers: [ToastService, { provide: ToastController, useValue: stub }],
      });
      const svc = TestBed.inject(ToastService);

      await svc.error('oh no');

      expect(presentMock).toHaveBeenCalledOnce();
    });
  });
});
