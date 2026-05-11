/**
 * Pure helpers used by JumpBackInBannerComponent — extracted so they can
 * be unit-tested without mounting the Ionic component graph.
 */

import type { LastSessionScreen } from '../core/last-session.service';

export function screenCopy(screen: LastSessionScreen): string {
  switch (screen) {
    case 'lobby':
      return 'In the lobby';
    case 'estimating':
      return 'Estimating now';
  }
}
