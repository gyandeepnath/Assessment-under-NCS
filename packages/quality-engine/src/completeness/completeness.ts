/**
 * Data-completeness gates.
 *
 * A test may only be scored if it has enough usable evidence to define a
 * threshold: a minimum count of valid trials and at least one correct AND one
 * incorrect response (to constrain the psychometric function). Tests that fail
 * are marked incomplete, never silently scored (ARCHITECTURE §6.1; PVANC §11.3).
 */

import type { CompletenessRule, CompletenessVerdict, TrialOutcome } from '@vision-platform/core-contracts';

export function checkCompleteness(trials: readonly TrialOutcome[], rule: CompletenessRule): CompletenessVerdict {
  const usable = trials.filter((t) => t.usableForThreshold);
  if (usable.length < rule.minValidTrials) {
    return { complete: false, reason: `only ${usable.length} valid trials (need ${rule.minValidTrials})` };
  }
  if (rule.requireErrorAndCorrect) {
    const hasCorrect = usable.some((t) => t.correct);
    const hasError = usable.some((t) => !t.correct);
    if (!hasCorrect || !hasError) {
      return { complete: false, reason: 'need at least one correct and one incorrect response' };
    }
  }
  return { complete: true };
}
