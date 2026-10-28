/**
 * True for a key press that belongs to an input method: the Enter that picks
 * a candidate is part of typing, not the Enter that submits.
 *
 * `isComposing` alone misses it on Safari, which ends the composition before
 * it reports the key. What it leaves is the key code every such press
 * carries, 229.
 */
export function isComposingKey(event: Event): boolean {
  const key = event as KeyboardEvent;
  return key.isComposing === true || key.keyCode === 229;
}
