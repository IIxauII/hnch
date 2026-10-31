/**
 * PROTOTYPE (#643). The chrome's icon registry: Ionicons outline only, one
 * concept → one icon (plan §5.7). Skip and End never share an icon (UX-056).
 */
import { addIcons } from 'ionicons';
import {
  addOutline,
  alertCircleOutline,
  arrowUndoOutline,
  checkmarkCircleOutline,
  chevronBackOutline,
  clipboardOutline,
  closeOutline,
  cloudOfflineOutline,
  copyOutline,
  createOutline,
  ellipsisHorizontal,
  ellipsisVertical,
  exitOutline,
  eyeOutline,
  helpCircleOutline,
  informationCircleOutline,
  listOutline,
  optionsOutline,
  peopleOutline,
  personAddOutline,
  personCircleOutline,
  playSkipForwardOutline,
  powerOutline,
  qrCodeOutline,
  refreshOutline,
  shareOutline,
  syncOutline,
  terminalOutline,
  warningOutline,
} from 'ionicons/icons';

let done = false;

export function registerChromeIcons(): void {
  if (done) return;
  done = true;
  addIcons({
    'add-outline': addOutline,
    'alert-circle-outline': alertCircleOutline,
    'arrow-undo-outline': arrowUndoOutline,
    'checkmark-circle-outline': checkmarkCircleOutline,
    'chevron-back-outline': chevronBackOutline,
    'clipboard-outline': clipboardOutline,
    'close-outline': closeOutline,
    'cloud-offline-outline': cloudOfflineOutline,
    'copy-outline': copyOutline,
    'create-outline': createOutline,
    'ellipsis-horizontal': ellipsisHorizontal,
    'ellipsis-vertical': ellipsisVertical,
    'exit-outline': exitOutline,
    'eye-outline': eyeOutline,
    'help-circle-outline': helpCircleOutline,
    'information-circle-outline': informationCircleOutline,
    'list-outline': listOutline,
    'options-outline': optionsOutline,
    'people-outline': peopleOutline,
    'person-add-outline': personAddOutline,
    'person-circle-outline': personCircleOutline,
    'play-skip-forward-outline': playSkipForwardOutline,
    'power-outline': powerOutline,
    'qr-code-outline': qrCodeOutline,
    'refresh-outline': refreshOutline,
    'share-outline': shareOutline,
    'sync-outline': syncOutline,
    'terminal-outline': terminalOutline,
    'warning-outline': warningOutline,
  });
}

/** Invite link for the room (route `/join?code=`, ADR-0026). */
export function inviteLink(code: string): string {
  return `https://hnch.dev/join?code=${code.replace('-', '')}`;
}

/** Best-effort copy; the prototype never fails loudly. */
export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}
