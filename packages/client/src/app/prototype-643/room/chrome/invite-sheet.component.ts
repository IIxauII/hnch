/**
 * PROTOTYPE (#643). Invite: the ONE place for invite controls (UX-029).
 * Big code, Share link (phone: OS share sheet; desktop never opens the OS sheet,
 * it copies + one toast), Copy link, an inline QR with a quiet zone, and the CLI
 * line. Display only: there is no in-app QR scanner anywhere (UX-085, O5).
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { ProtoStore } from '../../proto-store';
import { copyText, inviteLink } from './icons';
import { ProtoQrComponent } from './qr.component';
import { ProtoSheetComponent } from './sheet.component';

@Component({
  selector: 'proto-invite-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ProtoQrComponent, ProtoSheetComponent],
  template: `
    @let m = store.m();
    @let coarse = store.pointer() === 'coarse';
    <proto-sheet heading="Invite" titleId="ov-title">
      <div class="inv" data-ux="UX-029">
        <p class="lead">Join {{ m.state.name }} with this code</p>
        <p class="code tnum" [attr.aria-label]="'Code ' + spelled()">{{ m.state.code }}</p>
        <div class="btns">
          @if (coarse) {
            <button type="button" class="hn-btn primary block" (click)="share()">
              <ion-icon name="share-outline" aria-hidden="true" />Share link
            </button>
            <button type="button" class="hn-btn quiet" (click)="copy('Link copied')">
              <ion-icon name="copy-outline" aria-hidden="true" />Copy link
            </button>
          } @else {
            <button type="button" class="hn-btn primary" (click)="copy('Link copied')">
              <ion-icon name="copy-outline" aria-hidden="true" />Copy link
            </button>
            <span class="link tnum">{{ link() }}</span>
          }
        </div>
        <figure class="qr" data-ux="UX-044 UX-085">
          <proto-qr [seed]="m.state.code" [label]="'joining ' + m.state.name" />
          <figcaption>Scan with any phone camera. hnch has no scanner of its own.</figcaption>
        </figure>
        <div class="cli">
          <ion-icon name="terminal-outline" aria-hidden="true" />
          <code>{{ cli() }}</code>
          <button
            type="button"
            class="hn-btn quiet"
            aria-label="Copy the terminal command"
            (click)="copyCli()"
          >
            <ion-icon name="copy-outline" aria-hidden="true" />
          </button>
        </div>
      </div>
    </proto-sheet>
  `,
  styles: `
    .inv {
      display: grid;
      gap: var(--hn-space-4);
    }
    .lead {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
      text-align: center;
    }
    .code {
      margin: 0;
      font: var(--hn-type-display);
      font-size: 48px;
      line-height: 56px;
      text-align: center;
      letter-spacing: 0.02em;
    }
    .btns {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--hn-space-2);
    }
    .link {
      font: var(--hn-type-small);
      color: var(--hn-text-2);
      overflow-wrap: anywhere;
    }
    .qr {
      margin: 0;
      display: grid;
      gap: var(--hn-space-2);
    }
    figcaption {
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
      text-align: center;
    }
    .cli {
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      padding: var(--hn-space-2) var(--hn-space-3);
      border-radius: var(--hn-radius-md);
      background: var(--hn-surface-2);
    }
    .cli code {
      flex: 1;
      min-width: 0;
      font: 400 13px/18px var(--hn-mono);
      overflow-wrap: anywhere;
    }
  `,
})
export class ProtoInviteSheetComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly link = computed(() => inviteLink(this.store.m().state.code));
  protected readonly cli = computed(
    () => `npx -y @xauyxau/hnch join ${this.store.m().state.code.replace('-', '')}`,
  );
  protected readonly spelled = computed(() => this.store.m().state.code.split('').join(' '));

  protected share() {
    // Phone: the OS share sheet would open here. The prototype falls back to copy.
    this.copy('Share sheet opens here · link copied as a fallback');
  }
  protected copy(msg: string) {
    copyText(this.link());
    this.store.model.notify(msg, 'success');
    this.store.bump();
  }
  protected copyCli() {
    copyText(this.cli());
    this.store.model.notify('Command copied', 'success');
    this.store.bump();
  }
}
