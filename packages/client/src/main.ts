import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AccentService } from './app/core/accent.service';
import { AppPreferenceService } from './app/core/app-preference.service';
import { AvatarColorService } from './app/core/avatar-color.service';
import { ParticipantIdService } from './app/core/participant-id.service';
import { ScalePreferenceService } from './app/core/scale-preference.service';
import { ThemeService } from './app/core/theme.service';

// Ionic's `mode` is intentionally left unset — Ionic auto-detects per
// platform (iOS on iPhone, Material on Android / PWA). See ux.md §2.
bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular({ useSetInputAPI: true }),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // Pre-warm the participant id so every downstream screen can read
    // `participantIdService.id()` synchronously. The
    // Capacitor Device bridge is the slow path on cold start; doing it
    // once here keeps Home / Lobby / Estimating from ever observing a
    // transient `null`.
    provideAppInitializer(() => inject(ParticipantIdService).ensureLoaded()),
    // ThemeService must complete before AccentService so that .ion-palette-dark
    // is present on <html> when AccentService reads it for dark-mode overrides.
    // Resolve both injections synchronously before the first await — the
    // injection context is gone after any await boundary (NG0203 otherwise).
    provideAppInitializer(async () => {
      const theme = inject(ThemeService);
      const accent = inject(AccentService);
      await theme.ensureLoaded();
      await accent.loadFromStorage();
    }),
    provideAppInitializer(() => inject(ScalePreferenceService).ensureLoaded()),
    provideAppInitializer(() => inject(AppPreferenceService).ensureLoaded()),
    // Avatar color depends on ParticipantIdService (deterministic first-launch
    // uses the device id as seed). The id initializer above resolves first so
    // this one always sees a cached id.
    provideAppInitializer(() => inject(AvatarColorService).ensureLoaded()),
  ],
}).catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('hnch bootstrap failed', err);
});
