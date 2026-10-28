/** What an avatar shows for somebody who has no name. */
const NAMELESS = '?';

/** Made once: a segmenter is not cheap, and a participant list asks for one per row. */
const graphemes =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * The first character of a name, as a person reads it: a whole emoji or an
 * accented letter, not the first half of one. Uppercase. Empty for a name
 * that is empty or blank.
 */
export function nameInitial(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (trimmed === '') return '';
  return firstCharacter(trimmed).toUpperCase();
}

/**
 * The initial an avatar shows: {@link nameInitial}, or `?` for somebody
 * without a name — an empty circle reads as a glitch.
 */
export function avatarInitial(name: string | null | undefined): string {
  return nameInitial(name) || NAMELESS;
}

function firstCharacter(text: string): string {
  if (graphemes !== null) {
    for (const { segment } of graphemes.segment(text)) return segment;
  }
  // By code point, which still keeps a surrogate pair together.
  return Array.from(text)[0] ?? '';
}
