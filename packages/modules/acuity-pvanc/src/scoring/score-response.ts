/**
 * Response scoring (PVANC §8, §6.5).
 *
 * Pure: a response is correct iff its value matches the optotype's ground-truth
 * orientation. Usability for threshold estimation excludes anticipatory (<200 ms)
 * and out-of-window (>5000 ms) responses, which are treated as quality outliers.
 */

import type { StimulusSpec, ResponseEvent, TrialOutcome } from '@vision-platform/core-contracts';

const ANTICIPATION_MS = 200;
const RESPONSE_WINDOW_MS = 5000;

export function scoreResponse(stimulus: StimulusSpec, response: ResponseEvent): TrialOutcome {
  const correct = response.rawValue === stimulus.identity;
  const usableForThreshold = response.latencyMs >= ANTICIPATION_MS && response.latencyMs <= RESPONSE_WINDOW_MS;
  return { correct, usableForThreshold };
}
