/**
 * Returns true when rawValue trims to a non-empty string.
 * Matches the canContinue computed signal in OnboardingPage.
 */
export function canContinue(rawValue: string): boolean {
  return rawValue.trim().length > 0;
}
