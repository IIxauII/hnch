import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { formatScaleId, type Scale } from '@hnch/shared';

import { environment } from '../../environments/environment';
import { AccentService } from '../core/accent.service';
import { type AccentKey, ACCENTS } from '../core/accent.tokens';
import { AppPreferenceService } from '../core/app-preference.service';
import { DocService } from '../core/doc/doc.service';
import { DisplayNameService } from '../core/display-name.service';
import { ParticipantIdService } from '../core/participant-id.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { ThemeService, type Theme } from '../core/theme.service';
import { ScalePickerSheetComponent } from '../session-settings/scale-picker.sheet';
import { RelayUrlEditorSheetComponent } from './relay-url-editor.sheet';
import { presentSheet } from '../utils/present-sheet';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { SectionCardComponent } from '../shared/ui/section-card.component';

/**
 * App Settings screen
 *
 * Phase D redesign:
 *  - Mobile toolbar: "Settings" Inter Tight, leading back-button.
 *  - PageHeader eyebrow="preferences" title="Settings".
 *  - Grouped SectionCards: Profile, Appearance, Defaults, Connection, About.
 *  - ion-list inset lines="full" inside each card.
 *  - Right-aligned value previews in body-sm + muted color.
 */
@Component({
  selector: 'app-settings',
  host: { class: 'ion-page' },
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToggle,
    IonToolbar,
    PageHeaderComponent,
    RelayUrlEditorSheetComponent,
    ScalePickerSheetComponent,
    SectionCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title style="font: var(--hnch-title)">Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="page-body">
        <hnch-page-header
          eyebrow="preferences"
          title="Settings"
        />

        <!-- Profile -->
        <hnch-section-card eyebrow="profile" title="Profile">
          <ion-list inset="true" lines="full">
            <ion-item>
              <ion-input
                #displayNameInput
                label="Display name"
                labelPlacement="floating"
                [value]="displayName()"
                maxlength="40"
                aria-label="Display name"
                (ionBlur)="onDisplayNameBlur()"
              ></ion-input>
            </ion-item>
          </ion-list>
        </hnch-section-card>

        <!-- Appearance -->
        <hnch-section-card eyebrow="appearance" title="Appearance">
          <ion-list inset="true" lines="full">
            <ion-item>
              <ion-select
                label="Theme"
                interface="popover"
                [value]="themeService.theme()"
                (ionChange)="onThemeSelected($event.detail.value)"
                aria-label="Theme"
              >
                <ion-select-option value="system">System</ion-select-option>
                <ion-select-option value="light">Light</ion-select-option>
                <ion-select-option value="dark">Dark</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-select
                label="Accent"
                interface="popover"
                [interfaceOptions]="accentPopoverOptions"
                [value]="accentService.accent()"
                (ionChange)="onAccentSelected($event.detail.value)"
                aria-label="Accent color"
              >
                @for (entry of accentEntries; track entry.key) {
                  <ion-select-option [value]="entry.key">{{ entry.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-list>
        </hnch-section-card>

        <!-- Defaults -->
        <hnch-section-card eyebrow="defaults" title="Defaults">
          <ion-list inset="true" lines="full">
            <ion-item button (click)="openScalePicker()">
              <ion-label>Default scale</ion-label>
              <ion-note slot="end" class="value-preview">{{ scaleLabel() }}</ion-note>
            </ion-item>
            <ion-item>
              <ion-input
                #defaultSessionNameInput
                label="Default session name"
                labelPlacement="floating"
                placeholder="None"
                [value]="appPrefs.defaultSessionName() ?? ''"
                maxlength="60"
                aria-label="Default session name"
                (ionBlur)="onDefaultSessionNameBlur()"
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-label>Password by default</ion-label>
              <ion-toggle
                slot="end"
                [checked]="appPrefs.defaultPassword()"
                (ionChange)="onDefaultPasswordToggle($event.detail.checked)"
                aria-label="Enable password by default"
              ></ion-toggle>
            </ion-item>
          </ion-list>
        </hnch-section-card>

        <!-- Connection -->
        <hnch-section-card eyebrow="connection" title="Connection">
          <ion-list inset="true" lines="full">
            <ion-item button (click)="openRelayUrlEditor()">
              <ion-label>Relay URL</ion-label>
              <ion-note slot="end" class="value-preview">{{ relayUrlLabel() }}</ion-note>
            </ion-item>
          </ion-list>
        </hnch-section-card>

        <!-- About -->
        <hnch-section-card eyebrow="about" title="About">
          <ion-list inset="true" lines="full">
            <ion-item>
              <ion-label>Version</ion-label>
              <ion-note slot="end" class="value-preview">{{ version }}</ion-note>
            </ion-item>
          </ion-list>
        </hnch-section-card>
      </div>

      <!-- Scale picker half-sheet -->
      <ion-modal
        #scalePickerModal
        [isOpen]="scalePickerOpen()"
        [breakpoints]="[0, 0.6, 0.95]"
        [initialBreakpoint]="0.6"
        (didDismiss)="scalePickerOpen.set(false)"
      >
        <ng-template>
          <app-scale-picker-sheet
            [selectedScaleId]="scalePrefs.defaultScaleId()"
            (scaleSelected)="onScaleSelected($event)"
            (closeRequested)="closeScalePicker()"
          />
        </ng-template>
      </ion-modal>

      <!-- Relay URL editor modal -->
      <ion-modal
        #relayUrlModal
        [isOpen]="relayUrlEditorOpen()"
        [breakpoints]="[0, 0.6, 0.95]"
        [initialBreakpoint]="0.6"
        cssClass="hnch-form-modal"
        (didDismiss)="relayUrlEditorOpen.set(false)"
      >
        <ng-template>
          <app-relay-url-editor-sheet
            [currentUrl]="appPrefs.relayHttpUrl()"
            (saved)="onRelayUrlSaved($event)"
            (closeRequested)="closeRelayUrlEditor()"
          />
        </ng-template>
      </ion-modal>
    </ion-content>
  `,
  styles: [
    `
      ion-content {
        --background: var(--hnch-bg);
      }
      .page-body {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-4);
        padding: 0 var(--hnch-sp-4) var(--hnch-sp-6);
        max-width: 720px;
        margin: 0 auto;
      }
      /* Remove default ion-list inset margin since SectionCard provides its own padding */
      ion-list {
        margin: 0;
        background: transparent;
      }
      .value-preview {
        font: var(--hnch-body-sm);
        color: var(--ion-color-step-600, rgba(60,60,67,0.6));
      }
    `,
  ],
})
export class SettingsPage {
  private readonly displayNameService = inject(DisplayNameService);
  private readonly docService = inject(DocService);
  private readonly participantIdService = inject(ParticipantIdService);
  protected readonly scalePrefs = inject(ScalePreferenceService);
  protected readonly themeService = inject(ThemeService);
  protected readonly appPrefs = inject(AppPreferenceService);
  protected readonly accentService = inject(AccentService);

  protected readonly version = environment.appVersion;

  protected readonly displayName = signal('—');

  protected readonly accentEntries = (
    Object.entries(ACCENTS) as [AccentKey, (typeof ACCENTS)[AccentKey]][]
  ).map(([key, def]) => ({ key, label: def.label }));

  protected readonly accentPopoverOptions = { cssClass: 'accent-select-popover' };

  protected readonly scaleLabel = computed(() => {
    const scale = this.scalePrefs.defaultScale();
    return formatScaleId(scale.id);
  });

  protected readonly relayUrlLabel = computed(() => {
    const url = this.appPrefs.relayHttpUrl();
    return url || 'Default';
  });

  protected readonly scalePickerOpen = signal(false);
  protected readonly relayUrlEditorOpen = signal(false);

  private readonly displayNameInput = viewChild<IonInput>('displayNameInput');
  private readonly defaultSessionNameInput = viewChild<IonInput>('defaultSessionNameInput');
  private readonly scalePickerModalRef = viewChild<IonModal>('scalePickerModal');
  private readonly relayUrlModalRef = viewChild<IonModal>('relayUrlModal');

  constructor() {
    void this.loadDisplayName();
  }

  private async loadDisplayName(): Promise<void> {
    const name = await this.displayNameService.getDisplayName();
    if (name) this.displayName.set(name);
  }

  // ---------------------------------------------------------------------------
  // Display name
  // ---------------------------------------------------------------------------

  protected onDisplayNameBlur(): void {
    const input = this.displayNameInput();
    if (!input) return;
    const trimmed = ((input.value as string | null | undefined) ?? '').trim();
    if (!trimmed) {
      input.value = this.displayName();
      return;
    }
    if (trimmed === this.displayName()) return;
    this.onNameSaved(trimmed);
  }

  private onNameSaved(newName: string): void {
    this.displayName.set(newName);
    void this.displayNameService.setDisplayName(newName);

    const myId = this.participantIdService.id();
    if (myId && this.docService.hasSession()) {
      const existing = this.docService.participants().find((p) => p.id === myId);
      if (existing) {
        this.docService.upsertParticipant(myId, {
          displayName: newName,
          joinedAt: existing.joinedAt,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Theme + accent
  // ---------------------------------------------------------------------------

  protected onThemeSelected(value: Theme | null | undefined): void {
    if (value !== 'system' && value !== 'light' && value !== 'dark') return;
    if (value === this.themeService.theme()) return;
    void this.themeService.setTheme(value);
  }

  protected onAccentSelected(value: string | null | undefined): void {
    if (!value || !(value in ACCENTS)) return;
    if (value === this.accentService.accent()) return;
    this.accentService.setAccent(value as AccentKey);
  }

  // ---------------------------------------------------------------------------
  // Scale picker
  // ---------------------------------------------------------------------------

  protected openScalePicker(): void {
    const modal = this.scalePickerModalRef();
    if (modal) void presentSheet({ modal });
  }

  protected async closeScalePicker(): Promise<void> {
    await this.scalePickerModalRef()?.dismiss();
    this.scalePickerOpen.set(false);
  }

  protected onScaleSelected(scale: Scale): void {
    void this.scalePrefs.setDefaultScaleId(scale.id);
  }

  // ---------------------------------------------------------------------------
  // Default session name
  // ---------------------------------------------------------------------------

  protected onDefaultSessionNameBlur(): void {
    const input = this.defaultSessionNameInput();
    if (!input) return;
    const trimmed = ((input.value as string | null | undefined) ?? '').trim();
    void this.appPrefs.setDefaultSessionName(trimmed || undefined);
  }

  // ---------------------------------------------------------------------------
  // Default password toggle
  // ---------------------------------------------------------------------------

  protected onDefaultPasswordToggle(checked: boolean): void {
    void this.appPrefs.setDefaultPassword(checked);
  }

  // ---------------------------------------------------------------------------
  // Relay URL editor
  // ---------------------------------------------------------------------------

  protected openRelayUrlEditor(): void {
    const modal = this.relayUrlModalRef();
    if (modal) void presentSheet({ modal });
  }

  protected async closeRelayUrlEditor(): Promise<void> {
    await this.relayUrlModalRef()?.dismiss();
    this.relayUrlEditorOpen.set(false);
  }

  protected onRelayUrlSaved(url: string | undefined): void {
    void this.appPrefs.setRelayUrl(url);
  }
}
