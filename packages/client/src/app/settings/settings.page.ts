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
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonPopover,
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
import { ScalePickerSheetComponent } from '../session-settings/scale-picker.sheet'
import { RelayUrlEditorSheetComponent } from './relay-url-editor.sheet'
import { presentSheet } from '../utils/present-sheet'
import { AccentPickerPopoverComponent } from './accent-picker.popover'
import { ThemePickerPopoverComponent } from './theme-picker.popover'

const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

/**
 * App Settings screen — ux.md §5.7.
 *
 * Four sections: Profile (display name), Appearance (theme picker),
 * Scales (default scale picker), and About (version).
 * Display name + default session name use inline blur-save.
 * Theme + accent use IonPopover pickers.
 */
@Component({
  selector: 'app-settings',
  host: { class: 'ion-page' },
  imports: [
    AccentPickerPopoverComponent,
    RelayUrlEditorSheetComponent,
    ScalePickerSheetComponent,
    ThemePickerPopoverComponent,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonNote,
    IonPopover,
    IonTitle,
    IonToggle,
    IonToolbar,
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

      <!-- Appearance -->
      <ion-list-header>
        <ion-label>Appearance</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item button id="theme-trigger" aria-haspopup="listbox">
          <ion-label>Theme</ion-label>
          <ion-note slot="end">{{ themeLabel() }}</ion-note>
        </ion-item>
        <ion-popover
          trigger="theme-trigger"
          triggerAction="click"
          [dismissOnSelect]="true"
        >
          <ng-template>
            <app-theme-picker-popover
              [currentTheme]="themeService.theme()"
              (selected)="onThemeSelected($event)"
            />
          </ng-template>
        </ion-popover>

        <ion-item button id="accent-trigger" aria-haspopup="listbox">
          <ion-label>Accent</ion-label>
          <div class="accent-preview" slot="end" aria-hidden="true">
            <span class="accent-preview-dot" [style.background]="accentBase()"></span>
            <span class="accent-preview-name">{{ accentLabel() }}</span>
          </div>
        </ion-item>
        <ion-popover
          trigger="accent-trigger"
          triggerAction="click"
          [dismissOnSelect]="true"
        >
          <ng-template>
            <app-accent-picker-popover
              [currentAccent]="accentService.accent()"
              (selected)="accentService.setAccent($event)"
            />
          </ng-template>
        </ion-popover>
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
      </ion-list>

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

  protected readonly relayUrlLabel = computed(() => {
    const url = this.appPrefs.relayHttpUrl()
    return url || 'Default'
  })

  protected readonly scalePickerOpen = signal(false)
  protected readonly relayUrlEditorOpen = signal(false)

  private readonly displayNameInput = viewChild<IonInput>('displayNameInput')
  private readonly defaultSessionNameInput = viewChild<IonInput>('defaultSessionNameInput')
  private readonly scalePickerModalRef = viewChild<IonModal>('scalePickerModal')
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
  // Display name — inline blur-save
  // ---------------------------------------------------------------------------

  protected onDisplayNameBlur(): void {
    const input = this.displayNameInput()
    if (!input) return
    const trimmed = (input.value as string | null | undefined ?? '').trim()
    if (!trimmed) {
      // Revert to current value — display name is required.
      input.value = this.displayName()
      return
    }
    if (trimmed === this.displayName()) return
    this.onNameSaved(trimmed)
  }

  private onNameSaved(newName: string): void {
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
  // Default session name — inline blur-save
  // ---------------------------------------------------------------------------

  protected onDefaultSessionNameBlur(): void {
    const input = this.defaultSessionNameInput()
    if (!input) return
    const trimmed = (input.value as string | null | undefined ?? '').trim()
    void this.appPrefs.setDefaultSessionName(trimmed || undefined)
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
