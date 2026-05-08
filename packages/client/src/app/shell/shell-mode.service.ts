import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';

import { DocService } from '../core/doc/doc.service';

export type ShellMode = 'public' | 'session' | 'hidden';

/**
 * Derives the shell rail mode from the current URL and session state.
 *
 * - 'hidden'  — URL starts with /onboarding (full-bleed, no chrome)
 * - 'session' — DocService.hasSession() is true
 * - 'public'  — everything else (home, join, settings, etc.)
 */
@Injectable({ providedIn: 'root' })
export class ShellModeService {
  private readonly router = inject(Router);
  private readonly docService = inject(DocService);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly mode = computed<ShellMode>(() => {
    const url = this.url();
    if (url.startsWith('/onboarding')) return 'hidden';
    if (this.docService.hasSession()) return 'session';
    return 'public';
  });
}
