import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { chevronForwardOutline } from 'ionicons/icons'

import { formatScaleId, type Scale } from '@hnch/shared'

import { environment } from '../../environments/environment'
import { AccentService } from '../core/accent.service'
import { ACCENTS } from '../core/accent.tokens'
import { AppPreferenceService } from '../core/app-preference.service'
import { DocService } from '../core/doc/doc.service'
import { DisplayNameService } from '../core/display-name.service'
import { ParticipantIdService } from '../core/participant-id.service'
import { ScalePreferenceService } from '../core/scale-preference.service'
import { ThemeService, type Theme } from '../core/theme.service'
import { AccentSwatchGridComponent } from '../shared/accent-swatch-grid.component'
import { ScalePickerSheetComponent } from '../session-settings/scale-picker.sheet'
import { DisplayNameEditorSheetComponent } from './display-name-editor.sheet'
import { RelayUrlEditorSheetComponent } from './relay-url-editor.sheet'
import { SessionNameEditorSheetComponent } from './session-name-editor.sheet'
import { ThemePickerSheetComponent } from './theme-picker.sheet'
import { presentSheet } from '../utils/present-sheet'

const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

/**
 * App Settings screen — ux.md §5.7.
 *
 * Four sections: Profile (display name), Appearance (theme picker),
 * Scales (default scale picker), and About (version, licenses, privacy).
 * Each editable row opens a half-sheet picker/editor.
 */
@Component({
  selector: 'app-settings',
  host: { class: 'ion-page' },
  imports: [
    AccentSwatchGridComponent,
    DisplayNameEditorSheetComponent,
    RelayUrlEditorSheetComponent,
    ScalePickerSheetComponent,
    SessionNameEditorSheetComponent,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonNote,
    IonTitle,
    IonToggle,
    IonToolbar,
    ThemePickerSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .accent-preview {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .accent-preview-dot {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .accent-preview-name {
      font-size: 14px;
      color: var(--hnch-muted);
    }

    .accent-grid-wrap {
      width: 100%;
      padding: 8px 0 12px;
    }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <!-- Profile -->
      <ion-list-header>
        <ion-label>Profile</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item button (click)="openNameEditor()">
          <ion-label>Display name</ion-label>
          <ion-note slot="end">{{ displayName() }}</ion-note>
        </ion-item>
      </ion-list>

      <!-- Appearance -->
      <ion-list-header>
        <ion-label>Appearance</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item button (click)="openThemePicker()">
          <ion-label>Theme</ion-label>
          <ion-note slot="end">{{ themeLabel() }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>
            <h2>Accent</h2>
            <p>Highlight color used across the app</p>
          </ion-label>
          <div class="accent-preview" slot="end" aria-hidden="true">
            <span
              class="accent-preview-dot"
              [style.background]="accentBase()"
            ></span>
            <span class="accent-preview-name">{{ accentLabel() }}</span>
          </div>
        </ion-item>
        <ion-item lines="none">
          <div class="accent-grid-wrap">
            <app-accent-swatch-grid />
          </div>
        </ion-item>
      </ion-list>

      <!-- Scales -->
      <ion-list-header>
        <ion-label>Scales</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item button (click)="openScalePicker()">
          <ion-label>Default scale</ion-label>
          <ion-note slot="end">{{ scaleLabel() }}</ion-note>
        </ion-item>
      </ion-list>

      <!-- Session Defaults -->
      <ion-list-header>
        <ion-label>Session Defaults</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item button (click)="openSessionNameEditor()">
          <ion-label>Default session name</ion-label>
          <ion-note slot="end">{{ sessionNameLabel() }}</ion-note>
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

      <!-- Advanced -->
      <ion-list-header>
        <ion-label>Advanced</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item button (click)="openRelayUrlEditor()">
          <ion-label>Relay URL</ion-label>
          <ion-note slot="end">{{ relayUrlLabel() }}</ion-note>
        </ion-item>
      </ion-list>

      <!-- About -->
      <ion-list-header>
        <ion-label>About</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item>
          <ion-label>Version</ion-label>
          <ion-note slot="end">{{ version }}</ion-note>
        </ion-item>
        <ion-item disabled>
          <ion-label>Open source licenses</ion-label>
          <ion-note slot="end">Coming soon</ion-note>
        </ion-item>
        <ion-item disabled>
          <ion-label>Privacy</ion-label>
          <ion-note slot="end">Coming soon</ion-note>
        </ion-item>
      </ion-list>

      <!-- Name editor half-sheet -->
      <ion-modal
        #nameModal
        [isOpen]="nameEditorOpen()"
        [breakpoints]="[0, 0.6, 0.95]"
        [initialBreakpoint]="0.6"
        (didDismiss)="nameEditorOpen.set(false)"
      >
        <ng-template>
          <app-display-name-editor-sheet
            [currentName]="displayName()"
            (saved)="onNameSaved($event)"
            (closeRequested)="closeNameEditor()"
          />
        </ng-template>
      </ion-modal>

      <!-- Theme picker half-sheet -->
      <ion-modal
        #themeModal
        [isOpen]="themePickerOpen()"
        [breakpoints]="[0, 0.6, 0.95]"
        [initialBreakpoint]="0.6"
        (didDismiss)="themePickerOpen.set(false)"
      >
        <ng-template>
          <app-theme-picker-sheet
            [currentTheme]="themeService.theme()"
            (selected)="onThemeSelected($event)"
            (closeRequested)="closeThemePicker()"
          />
        </ng-template>
      </ion-modal>

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

      <!-- Session name editor half-sheet -->
      <ion-modal
        #sessionNameModal
        [isOpen]="sessionNameEditorOpen()"
        [breakpoints]="[0, 0.6, 0.95]"
        [initialBreakpoint]="0.6"
        (didDismiss)="sessionNameEditorOpen.set(false)"
      >
        <ng-template>
          <app-session-name-editor-sheet
            [currentName]="appPrefs.defaultSessionName()"
            (saved)="onSessionNameSaved($event)"
            (closeRequested)="closeSessionNameEditor()"
          />
        </ng-template>
      </ion-modal>

      <!-- Relay URL editor half-sheet -->
      <ion-modal
        #relayUrlModal
        [isOpen]="relayUrlEditorOpen()"
        [breakpoints]="[0, 0.6, 0.95]"
        [initialBreakpoint]="0.6"
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
})
export class SettingsPage {
  private readonly displayNameService = inject(DisplayNameService)
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)
  protected readonly scalePrefs = inject(ScalePreferenceService)
  protected readonly themeService = inject(ThemeService)
  protected readonly appPrefs = inject(AppPreferenceService)
  protected readonly accentService = inject(AccentService)

  protected readonly version = environment.appVersion

  /** Local cache of display name, loaded on init. */
  protected readonly displayName = signal('—')

  protected readonly themeLabel = computed(
    () => THEME_LABELS[this.themeService.theme()],
  )

  protected accentBase(): string {
    return ACCENTS[this.accentService.accent()].base
  }

  protected accentLabel(): string {
    return ACCENTS[this.accentService.accent()].label
  }

  protected readonly scaleLabel = computed(() => {
    const scale = this.scalePrefs.defaultScale()
    return formatScaleId(scale.id)
  })

  protected readonly sessionNameLabel = computed(() => {
    const name = this.appPrefs.defaultSessionName()
    return name || 'None'
  })

  protected readonly relayUrlLabel = computed(() => {
    const url = this.appPrefs.relayHttpUrl()
    return url || 'Default'
  })

  protected readonly nameEditorOpen = signal(false)
  protected readonly themePickerOpen = signal(false)
  protected readonly scalePickerOpen = signal(false)
  protected readonly sessionNameEditorOpen = signal(false)
  protected readonly relayUrlEditorOpen = signal(false)

  private readonly nameModalRef = viewChild<IonModal>('nameModal')
  private readonly themeModalRef = viewChild<IonModal>('themeModal')
  private readonly scalePickerModalRef = viewChild<IonModal>('scalePickerModal')
  private readonly sessionNameModalRef = viewChild<IonModal>('sessionNameModal')
  private readonly relayUrlModalRef = viewChild<IonModal>('relayUrlModal')

  constructor() {
    addIcons({ 'chevron-forward-outline': chevronForwardOutline })
    void this.loadDisplayName()
  }

  private async loadDisplayName(): Promise<void> {
    const name = await this.displayNameService.getDisplayName()
    if (name) this.displayName.set(name)
  }

  // ---------------------------------------------------------------------------
  // Name editor
  // ---------------------------------------------------------------------------

  protected openNameEditor(): void {
    const modal = this.nameModalRef()
    if (modal) void presentSheet({ modal })
  }

  protected async closeNameEditor(): Promise<void> {
    await this.nameModalRef()?.dismiss()
    this.nameEditorOpen.set(false)
  }

  protected onNameSaved(newName: string): void {
    this.displayName.set(newName)
    void this.displayNameService.setDisplayName(newName)

    // If mid-session, propagate to peers via the Yjs doc.
    const myId = this.participantIdService.id()
    if (myId && this.docService.hasSession()) {
      const existing = this.docService
        .participants()
        .find((p) => p.id === myId)
      if (existing) {
        this.docService.upsertParticipant(myId, {
          displayName: newName,
          joinedAt: existing.joinedAt,
        })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Theme picker
  // ---------------------------------------------------------------------------

  protected openThemePicker(): void {
    const modal = this.themeModalRef()
    if (modal) void presentSheet({ modal })
  }

  protected async closeThemePicker(): Promise<void> {
    await this.themeModalRef()?.dismiss()
    this.themePickerOpen.set(false)
  }

  protected onThemeSelected(value: Theme): void {
    void this.themeService.setTheme(value)
  }

  // ---------------------------------------------------------------------------
  // Scale picker
  // ---------------------------------------------------------------------------

  protected openScalePicker(): void {
    const modal = this.scalePickerModalRef()
    if (modal) void presentSheet({ modal })
  }

  protected async closeScalePicker(): Promise<void> {
    await this.scalePickerModalRef()?.dismiss()
    this.scalePickerOpen.set(false)
  }

  protected onScaleSelected(scale: Scale): void {
    void this.scalePrefs.setDefaultScaleId(scale.id)
  }

  // ---------------------------------------------------------------------------
  // Session name editor
  // ---------------------------------------------------------------------------

  protected openSessionNameEditor(): void {
    const modal = this.sessionNameModalRef()
    if (modal) void presentSheet({ modal })
  }

  protected async closeSessionNameEditor(): Promise<void> {
    await this.sessionNameModalRef()?.dismiss()
    this.sessionNameEditorOpen.set(false)
  }

  protected onSessionNameSaved(name: string | undefined): void {
    void this.appPrefs.setDefaultSessionName(name)
  }

  // ---------------------------------------------------------------------------
  // Default password toggle
  // ---------------------------------------------------------------------------

  protected onDefaultPasswordToggle(checked: boolean): void {
    void this.appPrefs.setDefaultPassword(checked)
  }

  // ---------------------------------------------------------------------------
  // Relay URL editor
  // ---------------------------------------------------------------------------

  protected openRelayUrlEditor(): void {
    const modal = this.relayUrlModalRef()
    if (modal) void presentSheet({ modal })
  }

  protected async closeRelayUrlEditor(): Promise<void> {
    await this.relayUrlModalRef()?.dismiss()
    this.relayUrlEditorOpen.set(false)
  }

  protected onRelayUrlSaved(url: string | undefined): void {
    void this.appPrefs.setRelayUrl(url)
  }
}
