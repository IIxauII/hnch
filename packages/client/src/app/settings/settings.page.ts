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
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { chevronForwardOutline } from 'ionicons/icons'

import { environment } from '../../environments/environment'
import { DocService } from '../core/doc/doc.service'
import { DisplayNameService } from '../core/display-name.service'
import { ParticipantIdService } from '../core/participant-id.service'
import { ThemeService, type Theme } from '../core/theme.service'
import { DisplayNameEditorSheetComponent } from './display-name-editor.sheet'
import { ThemePickerSheetComponent } from './theme-picker.sheet'

const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

/**
 * App Settings screen — ux.md §5.7.
 *
 * Three sections: Profile (display name), Appearance (theme picker),
 * and About (version, licenses, privacy). Each editable row opens a
 * half-sheet picker/editor.
 */
@Component({
  selector: 'app-settings',
  host: { class: 'ion-page' },
  imports: [
    DisplayNameEditorSheetComponent,
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
    IonToolbar,
    ThemePickerSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
        <ion-item>
          <ion-label>Open source licenses</ion-label>
        </ion-item>
        <ion-item>
          <ion-label>Privacy</ion-label>
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
    </ion-content>
  `,
})
export class SettingsPage {
  private readonly displayNameService = inject(DisplayNameService)
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)
  protected readonly themeService = inject(ThemeService)

  protected readonly version = environment.appVersion

  /** Local cache of display name, loaded on init. */
  protected readonly displayName = signal('—')

  protected readonly themeLabel = computed(
    () => THEME_LABELS[this.themeService.theme()],
  )

  protected readonly nameEditorOpen = signal(false)
  protected readonly themePickerOpen = signal(false)

  private readonly nameModalRef = viewChild<IonModal>('nameModal')
  private readonly themeModalRef = viewChild<IonModal>('themeModal')

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
    this.nameEditorOpen.set(true)
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
    this.themePickerOpen.set(true)
  }

  protected async closeThemePicker(): Promise<void> {
    await this.themeModalRef()?.dismiss()
    this.themePickerOpen.set(false)
  }

  protected onThemeSelected(value: Theme): void {
    void this.themeService.setTheme(value)
  }
}
