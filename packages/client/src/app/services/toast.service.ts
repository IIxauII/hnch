import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastCtrl = inject(ToastController);

  constructor() {
    // The error toast's dismiss button names this icon; an unregistered name
    // renders an empty button.
    addIcons({ close });
  }

  async info(message: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'top',
    });
    await t.present();
  }

  async error(message: string, opts: { closeIcon?: boolean } = {}): Promise<void> {
    const closeIcon = opts.closeIcon ?? true;
    const t = await this.toastCtrl.create({
      message,
      duration: 4000,
      position: 'top',
      ...(closeIcon && {
        buttons: [{ icon: 'close', role: 'cancel', htmlAttributes: { 'aria-label': 'Dismiss' } }],
      }),
    });
    await t.present();
  }
}
