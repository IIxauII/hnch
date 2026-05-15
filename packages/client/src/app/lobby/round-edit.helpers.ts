import type { RoundEditSubmission } from './round-edit.sheet';

/**
 * Builds the submission payload from raw form values.
 * Returns null when title is empty/whitespace-only (submit should be a no-op).
 */
export function buildRoundEditSubmission(
  titleValue: string,
  descValue: string,
): RoundEditSubmission | null {
  if (titleValue.trim() === '') return null;
  const title = titleValue.trim();
  const rawDesc = descValue.trim();
  return { title, description: rawDesc === '' ? null : rawDesc };
}
