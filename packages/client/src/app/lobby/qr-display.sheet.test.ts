// Exercises: qr-display.sheet:QrDisplaySheetComponent

import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,MOCK_QR'),
  },
}));

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});
  return {
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonContent: stub('ion-content'),
    IonHeader: stub('ion-header'),
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
  };
});

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import QRCode from 'qrcode';
import { QrDisplaySheetComponent } from './qr-display.sheet';

async function mountSheet(inviteUrl: string, roomCode: string) {
  TestBed.configureTestingModule({ imports: [QrDisplaySheetComponent] });
  const fixture = TestBed.createComponent(QrDisplaySheetComponent);
  fixture.componentRef.setInput('inviteUrl', inviteUrl);
  fixture.componentRef.setInput('roomCode', roomCode);
  fixture.detectChanges();
  // flush the async QR generation
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('QrDisplaySheetComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('calls QRCode.toDataURL with the invite URL and correct options', async () => {
    await mountSheet('https://hnch.dev/join?code=ABC123', 'ABC123');

    expect(QRCode.toDataURL).toHaveBeenCalledWith('https://hnch.dev/join?code=ABC123', {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  });

  it('renders an img element with the generated data URL', async () => {
    const fixture = await mountSheet('https://hnch.dev/join?code=DEF456', 'DEF456');
    const img: HTMLImageElement | null = fixture.nativeElement.querySelector('img');

    expect(img).not.toBeNull();
    expect(img!.src).toContain('data:image/png;base64,MOCK_QR');
  });

  it('renders the room code in the template', async () => {
    const fixture = await mountSheet('https://hnch.dev/join?code=GHI789', 'GHI789');
    const text: string = fixture.nativeElement.textContent ?? '';

    expect(text).toContain('GHI789');
  });

  it('sets qrDataUrl to null on QRCode generation error (non-critical failure, shows room code fallback)', async () => {
    (QRCode.toDataURL as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('canvas not available'),
    );

    const fixture = await mountSheet('https://hnch.dev/join?code=ERR000', 'ERR000');
    const img: HTMLImageElement | null = fixture.nativeElement.querySelector('img');

    // No img rendered when qrDataUrl is null
    expect(img).toBeNull();
    // Room code text is still visible
    const text: string = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('ERR000');
  });

  it('renders a Done button for dismissal', async () => {
    const fixture = await mountSheet('https://hnch.dev/join?code=CLO000', 'CLO000');
    const btn: HTMLElement | null = fixture.nativeElement.querySelector('ion-button');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Done');
  });
});
