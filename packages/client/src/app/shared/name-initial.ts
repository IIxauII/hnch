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

function firstCharacter(text: string): string {
  if (typeof Intl.Segmenter === 'function') {
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
    for (const { segment } of segments) return segment;
  }
  // By code point, which still keeps a surrogate pair together.
  return Array.from(text)[0] ?? '';
}
