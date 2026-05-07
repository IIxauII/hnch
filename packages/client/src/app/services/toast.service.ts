import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastCtrl = inject(ToastController);

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
      ...(closeIcon && { buttons: [{ icon: 'close', role: 'cancel' }] }),
    });
    await t.present();
  }
}
