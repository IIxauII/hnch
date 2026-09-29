/**
 * Pure helpers used by HomePage — extracted so they can be unit-tested
 * directly without spinning up the full component graph (Ionic / Capacitor
 * / DI). All exports are dependency-free.
 */

import type { LastSessionScreen } from '../core/last-session.service';

/** Home's headline: a greeting once the stored display name has loaded. */
export function greetingFor(displayName: string | null): string {
  const name = displayName?.trim() ?? '';
  return name.length > 0 ? `Hi, ${name}` : 'Welcome';
}

export function routeForScreen(screen: LastSessionScreen, code: string): string {
  switch (screen) {
    case 'lobby':
      return `/lobby/${code}`;
    case 'estimating':
      return `/estimating/${code}`;
  }
}
