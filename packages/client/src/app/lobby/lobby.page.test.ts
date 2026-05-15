/**
 * Unit tests for the LobbyPage role predicate and the subtitle computed
 * (custom-scale label resolution). The chip-color and chip-label
 * expressions live inline in the template — those remain e2e-covered.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import type { CustomScale, ParticipantSnapshot, Scale } from '@hnch/shared';

import { isParticipantViewer } from './lobby-helpers';

function makeParticipant(id: string, role?: 'voter' | 'viewer'): ParticipantSnapshot {
  return { id, displayName: id, joinedAt: 0, role };
}

describe('LobbyPage — isParticipantViewer', () => {
  it('false when role field is omitted (default voter)', () => {
    expect(isParticipantViewer(makeParticipant('me'))).toBe(false);
  });

  it('false when role is explicitly voter', () => {
    expect(isParticipantViewer(makeParticipant('me', 'voter'))).toBe(false);
  });

  it('true when role is viewer', () => {
    expect(isParticipantViewer(makeParticipant('me', 'viewer'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LobbyPage.subtitle — exercises getScaleLabel(id, customScales()) at line 649
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Injectable } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});

  @Injectable()
  class AlertController {
    create = vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() });
  }

  return {
    AlertController,
    IonAccordion: stub('ion-accordion'),
    IonAccordionGroup: stub('ion-accordion-group'),
    IonAvatar: stub('ion-avatar'),
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonChip: stub('ion-chip'),
    IonCol: stub('ion-col'),
    IonContent: stub('ion-content'),
    IonFooter: stub('ion-footer'),
    IonGrid: stub('ion-grid'),
    IonHeader: stub('ion-header'),
    IonIcon: stub('ion-icon'),
    IonInput: stub('ion-input'),
    IonItem: stub('ion-item'),
    IonItemOption: stub('ion-item-option'),
    IonItemOptions: stub('ion-item-options'),
    IonItemSliding: stub('ion-item-sliding'),
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonModal: stub('ion-modal'),
    IonNote: stub('ion-note'),
    IonRow: stub('ion-row'),
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({
  chevronBackOutline: '',
  closeCircleOutline: '',
  copyOutline: '',
  ellipsisHorizontalCircle: '',
  logOutOutline: '',
  pencilOutline: '',
  personCircleOutline: '',
  personRemoveOutline: '',
  qrCodeOutline: '',
  settingsOutline: '',
  shareOutline: '',
  starOutline: '',
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(), canShare: vi.fn() } }));

const stubStandalone = async (selector: string, name: string) => {
  const { Component } = await import('@angular/core');
  @Component({ selector, template: '', standalone: true })
  class S {}
  return { [name]: S };
};
vi.mock('../core/connection-chip.component', () =>
  stubStandalone('app-connection-chip', 'ConnectionChipComponent'),
);
vi.mock('../shared/connection-status-banner.component', () =>
  stubStandalone('app-connection-status-banner', 'ConnectionStatusBannerComponent'),
);
vi.mock('../round-start/round-start.sheet', () =>
  stubStandalone('app-round-start-sheet', 'RoundStartSheetComponent'),
);
vi.mock('./round-edit.sheet', () =>
  stubStandalone('app-round-edit-sheet', 'RoundEditSheetComponent'),
);
vi.mock('../session-settings/session-settings.sheet', () =>
  stubStandalone('app-session-settings-sheet', 'SessionSettingsSheetComponent'),
);
vi.mock('../shared/round-history.component', () =>
  stubStandalone('app-round-history', 'RoundHistoryComponent'),
);
vi.mock('../shared/vote-results.component', () =>
  stubStandalone('app-vote-results', 'VoteResultsComponent'),
);
vi.mock('./qr-display.sheet', () =>
  stubStandalone('app-qr-display-sheet', 'QrDisplaySheetComponent'),
);
vi.mock('../join/join.page', () => ({ rejectionCopy: () => 'rejected' }));

async function mountLobby(scale: Scale | undefined, customs: CustomScale[]) {
  const { Router } = await import('@angular/router');
  const { DocService } = await import('../core/doc/doc.service');
  const { HapticService } = await import('../core/haptic.service');
  const { ParticipantIdService } = await import('../core/participant-id.service');
  const { LastSessionService } = await import('../core/last-session.service');
  const { ScalePreferenceService } = await import('../core/scale-preference.service');
  const { SurfaceService } = await import('../core/surface.service');
  const { ToastService } = await import('../services/toast.service');
  const { ExportService } = await import('../core/export.service');
  const { AlertController } = await import('@ionic/angular/standalone');

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      {
        provide: DocService,
        useValue: {
          settings: signal(scale ? { defaultScale: scale } : undefined).asReadonly(),
          roomCode: signal('ABC123').asReadonly(),
          meta: signal(undefined).asReadonly(),
          syncStatus: signal('disconnected').asReadonly(),
          currentRound: signal(undefined).asReadonly(),
          lastRejection: signal(null).asReadonly(),
          rounds: signal([]).asReadonly(),
          participants: signal([]).asReadonly(),
          onlineIds: signal(new Set()).asReadonly(),
          endSession: vi.fn(),
        },
      },
      { provide: HapticService, useValue: { impactLight: vi.fn() } },
      { provide: ParticipantIdService, useValue: { id: signal('me').asReadonly() } },
      { provide: LastSessionService, useValue: { record: vi.fn() } },
      {
        provide: ScalePreferenceService,
        useValue: { customScales: signal(customs).asReadonly() },
      },
      {
        provide: SurfaceService,
        useValue: {
          mode: signal('mobile').asReadonly(),
          sheetBreakpoints: () => [0, 0.5, 1],
          initialSheetBreakpoint: () => 0.5,
          sheetBreakpointsFull: () => [0, 0.6, 1],
          initialSheetBreakpointFull: () => 1,
        },
      },
      { provide: ToastService, useValue: { show: vi.fn(), error: vi.fn() } },
      { provide: ExportService, useValue: { export: vi.fn() } },
      {
        provide: AlertController,
        useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }) },
      },
    ],
  });

  const { LobbyPage } = await import('./lobby.page');
  // Skip detectChanges — the template touches many computeds we don't need
  // for this assertion. Component-instance access reaches the subtitle
  // computed directly.
  return TestBed.createComponent(LobbyPage);
}

describe('LobbyPage — subtitle (custom scale label)', () => {
  it('shows the custom label when defaultScale is a known custom scale', async () => {
    const fixture = await mountLobby({ id: 'custom-bananas', cards: ['1', '2'] }, [
      { id: 'custom-bananas', label: 'Team Bananas', cards: ['1', '2'] },
    ]);
    const subtitle = (
      fixture.componentInstance as unknown as { subtitle: () => string }
    ).subtitle();
    expect(subtitle).toContain('Team Bananas');
    expect(subtitle).not.toContain('custom-bananas');
  });

  it('falls back to formatted id when the custom label is blank', async () => {
    const fixture = await mountLobby({ id: 'custom-no-label', cards: ['1'] }, [
      { id: 'custom-no-label', label: '', cards: ['1'] },
    ]);
    const subtitle = (
      fixture.componentInstance as unknown as { subtitle: () => string }
    ).subtitle();
    expect(subtitle).toContain('No Label');
  });

  it('shows the builtin display name for a builtin scale', async () => {
    const fixture = await mountLobby({ id: 'fibonacci', cards: ['0', '1'] }, []);
    const subtitle = (
      fixture.componentInstance as unknown as { subtitle: () => string }
    ).subtitle();
    expect(subtitle).toContain('Fibonacci');
  });
});
