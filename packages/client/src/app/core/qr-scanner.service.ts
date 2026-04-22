import { Injectable } from '@angular/core'
import {
  BarcodeFormat,
  BarcodeScanner,
} from '@capacitor-mlkit/barcode-scanning'

/**
 * Thin wrapper around `@capacitor-mlkit/barcode-scanning` for QR
 * code scanning on the Join page.
 *
 * Handles permission prompting and restricts scanning to QR codes
 * only (skips ML Kit's 1D barcode models on native).
 */
@Injectable({ providedIn: 'root' })
export class QrScannerService {
  /**
   * Prompt for camera permission (if needed), then open the scanner.
   * Returns the raw decoded string from the first QR code scanned,
   * or `null` if the user cancelled, denied permission, or an error
   * occurred.
   */
  async scanForCode(): Promise<string | null> {
    const { camera } = await BarcodeScanner.requestPermissions()
    if (camera !== 'granted' && camera !== 'limited') return null

    try {
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode],
      })
      return barcodes[0]?.rawValue ?? null
    } catch {
      // User cancelled the scanner or an unexpected error occurred.
      return null
    }
  }
}
