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
  ],
}).catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('hnch bootstrap failed', err)
})
