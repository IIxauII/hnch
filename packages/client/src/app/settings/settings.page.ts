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
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonRow,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';

import {
  AVATAR_PALETTE_KEYS,
  getScaleLabel,
  parseAvatarColor,
  resolveAvatarColor,
  type Scale,
} from '@hnch/shared';

import { environment } from '../../environments/environment';
import { AccentService } from '../core/accent.service';
import { type AccentKey, ACCENTS } from '../core/accent.tokens';
import { AppPreferenceService } from '../core/app-preference.service';
import { AvatarColorService } from '../core/avatar-color.service';
import { DocService } from '../core/doc/doc.service';
import { DisplayNameService } from '../core/display-name.service';
import { ParticipantIdService } from '../core/participant-id.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { ThemeService, type Theme } from '../core/theme.service';
import { SurfaceService } from '../core/surface.service';
import { ScalePickerSheetComponent } from '../session-settings/scale-picker.sheet';
import { RelayUrlEditorSheetComponent } from './relay-url-editor.sheet';
import { presentSheet } from '../utils/present-sheet';
import { isValidAccent, isValidTheme, relayUrlDisplayLabel } from './settings.helpers';

/**
 * App Settings screen — ux.md §5.7.
 *
 * Four sections: Profile (display name), Appearance (theme + accent),
 * Scales (default scale picker), and About (version).
 * Display name + default session name use inline blur-save.
 * Theme + accent use ion-select with `interface="popover"`.
 */
@Component({
  selector: 'app-settings',
  host: { class: 'ion-page' },
  imports: [
    RelayUrlEditorSheetComponent,
    ScalePickerSheetComponent,
    IonBackButton,
    IonButtons,
    IonCol,
    IonContent,
    IonGrid,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonNote,
    IonRow,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToggle,
    IonToolbar,
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
      <ion-grid fixed class="page-container">
        <ion-row><ion-col>
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
        <ion-item>
          <ion-select
            label="Avatar color"
            interface="popover"
            [interfaceOptions]="accentPopoverOptions"
            [value]="avatarSelectValue()"
            (ionChange)="onAvatarSelectChanged($event.detail.value)"
          >
            @for (entry of paletteEntries; track entry.key) {
              <ion-select-option [value]="entry.key">{{ entry.label }}</ion-select-option>
            }
            <ion-select-option value="custom">Custom…</ion-select-option>
          </ion-select>
          <span
            class="avatar-preview"
            aria-hidden="true"
            slot="end"
            [style.background]="avatarResolvedColor()"
          ></span>
        </ion-item>
        @if (avatarSelectValue() === 'custom') {
          <ion-item>
            <ion-input
              #avatarHexInput
              label="Custom hex"
              labelPlacement="stacked"
              placeholder="#rrggbb"
              [value]="customHexInputValue()"
              maxlength="7"
              aria-label="Custom avatar color (hex)"
              (ionBlur)="onAvatarHexBlur()"
            ></ion-input>
          </ion-item>
        }
      </ion-list>

      <!-- Appearance -->
      <ion-list-header>
        <ion-label>Appearance</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item>
          <ion-select
            label="Theme"
            interface="popover"
            [value]="themeService.theme()"
            (ionChange)="onThemeSelected($event.detail.value)"
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
          >
            @for (entry of accentEntries; track entry.key) {
              <ion-select-option [value]="entry.key">{{ entry.label }}</ion-select-option>
            }
          </ion-select>
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

      <!-- Keyboard shortcuts (issue #154) -->
      <ion-list-header>
        <ion-label>Keyboard shortcuts</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        <ion-item>
          <ion-label>
            <h3>1 – 9, 0</h3>
            <p>Cards 1 – 10 (digit re-press clears)</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            <h3>← / →</h3>
            <p>Move focus between cards</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            <h3>Enter / Space</h3>
            <p>Cast or clear vote on focused card</p>
          </ion-label>
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

        </ion-col></ion-row>
      </ion-grid>

      <!-- Scale picker half-sheet -->
      <ion-modal
        #scalePickerModal
        cssClass="modal-centered"
        [isOpen]="scalePickerOpen()"
        [breakpoints]="surface.sheetBreakpoints()"
        [initialBreakpoint]="surface.initialSheetBreakpoint()"
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
        cssClass="modal-centered"
        [isOpen]="relayUrlEditorOpen()"
        [breakpoints]="surface.sheetBreakpoints()"
        [initialBreakpoint]="surface.initialSheetBreakpoint()"
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
      @use '../../theme/breakpoints' as *;
      @use '../../theme/page-container' as *;
      @include page-container(720px);

      ion-list-header {
        padding-inline-start: 16px;
      }
      .avatar-preview {
        display: inline-block;
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        border: 1px solid var(--ion-color-step-300, #ccc);
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
  protected readonly avatarColorService = inject(AvatarColorService);
  protected readonly surface = inject(SurfaceService);

  protected readonly version = environment.appVersion;

  /** Local cache of display name, loaded on init. */
  protected readonly displayName = signal('—');

  protected readonly accentEntries = (
    Object.entries(ACCENTS) as [AccentKey, (typeof ACCENTS)[AccentKey]][]
  ).map(([key, def]) => ({ key, label: def.label }));

  protected readonly accentPopoverOptions = { cssClass: 'accent-select-popover' };

  /** Ordered palette entries for the avatar-color dropdown (ADR-0043). */
  protected readonly paletteEntries = (AVATAR_PALETTE_KEYS as readonly AccentKey[]).map((key) => ({
    key,
    label: ACCENTS[key].label,
  }));

  /** Current wire value from the AvatarColorService signal. May be null pre-bootstrap. */
  protected readonly avatarValue = this.avatarColorService.value;

  /**
   * Value bound to the avatar-color ion-select. Maps a custom `#rrggbb`
   * wire value onto the literal `'custom'` so the dropdown can carry a
   * "Custom…" option without enumerating every possible hex.
   */
  protected readonly avatarSelectValue = computed(() => {
    const v = this.avatarValue();
    if (!v) return null;
    return v.startsWith('#') ? 'custom' : v;
  });

  /** Resolved hex for the preview chip. Falls back to deterministic id if unset. */
  protected readonly avatarResolvedColor = computed(() => {
    const id = this.participantIdService.id() ?? 'unknown';
    return resolveAvatarColor(this.avatarValue() ?? undefined, id);
  });

  /** Value shown in the hex input — populated only when the user picked custom hex. */
  protected readonly customHexInputValue = computed(() => {
    const v = this.avatarValue();
    if (!v) return '';
    return v.startsWith('#') ? v : '';
  });

  protected readonly scaleLabel = computed(() => {
    const scale = this.scalePrefs.defaultScale();
    return getScaleLabel(scale.id, this.scalePrefs.customScales());
  });

  protected readonly relayUrlLabel = computed(() =>
    relayUrlDisplayLabel(this.appPrefs.relayHttpUrl()),
  );

  protected readonly scalePickerOpen = signal(false);
  protected readonly relayUrlEditorOpen = signal(false);

  private readonly displayNameInput = viewChild<IonInput>('displayNameInput');
  private readonly avatarHexInput = viewChild<IonInput>('avatarHexInput');
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
  // Display name — inline blur-save
  // ---------------------------------------------------------------------------

  protected onDisplayNameBlur(): void {
    const input = this.displayNameInput();
    if (!input) return;
    const trimmed = ((input.value as string | null | undefined) ?? '').trim();
    if (!trimmed) {
      // Revert to current value — display name is required.
      input.value = this.displayName();
      return;
    }
    if (trimmed === this.displayName()) return;
    this.onNameSaved(trimmed);
  }

  private onNameSaved(newName: string): void {
    this.displayName.set(newName);
    void this.displayNameService.setDisplayName(newName);

    // If mid-session, propagate to peers via the Yjs doc.
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
  // Theme + accent pickers (ion-select interface="popover")
  // ---------------------------------------------------------------------------

  protected onThemeSelected(value: Theme | null | undefined): void {
    if (!isValidTheme(value)) return;
    if (value === this.themeService.theme()) return;
    void this.themeService.setTheme(value);
  }

  protected onAccentSelected(value: string | null | undefined): void {
    if (!isValidAccent(value)) return;
    if (value === this.accentService.accent()) return;
    this.accentService.setAccent(value);
  }

  // ---------------------------------------------------------------------------
  // Avatar color picker (ADR-0043)
  // ---------------------------------------------------------------------------

  /**
   * Dropdown change handler. Palette key → persist directly.
   * `'custom'` → reveal the hex input but keep any prior hex value;
   * if there is no prior hex, seed it with the current resolved color.
   */
  protected onAvatarSelectChanged(value: string | null | undefined): void {
    if (!value) return;
    if (value === this.avatarSelectValue()) return;
    if (value === 'custom') {
      const current = this.avatarValue();
      if (current && current.startsWith('#')) return; // already custom — no-op
      const seed = this.avatarResolvedColor().toLowerCase();
      void this.persistAvatarColor(seed);
      return;
    }
    if (parseAvatarColor(value) === null) return;
    void this.persistAvatarColor(value);
  }

  protected onAvatarHexBlur(): void {
    const input = this.avatarHexInput();
    if (!input) return;
    const raw = ((input.value as string | null | undefined) ?? '').trim();
    if (!raw) return; // Empty input = no change; user must explicitly clear via palette pick.
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    if (parseAvatarColor(normalized) === null) {
      // Reject malformed: snap back to current value.
      input.value = this.customHexInputValue();
      return;
    }
    if (normalized.toLowerCase() === this.avatarValue()) return;
    void this.persistAvatarColor(normalized.toLowerCase());
  }

  private async persistAvatarColor(wire: string): Promise<void> {
    await this.avatarColorService.setValue(wire);
    // Mid-session: publish into the participant record so peers see the change live.
    const myId = this.participantIdService.id();
    if (myId && this.docService.hasSession()) {
      this.docService.setAvatarColor(myId, wire);
    }
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
  // Default session name — inline blur-save
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
