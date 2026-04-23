import { inject, provideAppInitializer } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import {
  PreloadAllModules,
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router'
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone'

import { AppComponent } from './app/app.component'
import { routes } from './app/app.routes'
import { ParticipantIdService } from './app/core/participant-id.service'
import { ScalePreferenceService } from './app/core/scale-preference.service'
import { ThemeService } from './app/core/theme.service'

// Ionic's `mode` is intentionally left unset — Ionic auto-detects per
// platform (iOS on iPhone, Material on Android / PWA). See ux.md §2.
bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withComponentInputBinding(),
    ),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // Pre-warm the participant id so every downstream screen can read
    // `participantIdService.id()` synchronously (plan §3.6). The
    // Capacitor Device bridge is the slow path on cold start; doing it
    // once here keeps Home / Lobby / Estimating from ever observing a
    // transient `null`.
    provideAppInitializer(() => inject(ParticipantIdService).ensureLoaded()),
    provideAppInitializer(() => inject(ThemeService).ensureLoaded()),
    provideAppInitializer(() => inject(ScalePreferenceService).ensureLoaded()),
  ],
}).catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('hnch bootstrap failed', err)
})
