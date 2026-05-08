import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { roundsToMarkdown, type RoundExportInput } from '@hnch/shared';

/**
 * Copies session results as Markdown to the device clipboard.
 *
 * Platform fork mirrors qr-scanner.service.ts:
 *   native  → @capacitor/clipboard Clipboard.write
 *   web     → navigator.clipboard.writeText
 *
 * Throws on clipboard failure; callers wrap in try/catch.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  async copyRoundsAsMarkdown(input: RoundExportInput): Promise<void> {
    const md = roundsToMarkdown(input);
    if (Capacitor.isNativePlatform()) {
      await Clipboard.write({ string: md });
    } else {
      await navigator.clipboard.writeText(md);
    }
  }
}
