/**
 * @vision-platform/simulation — virtual observers & harness (dev only).
 *
 * Generic psychometric observer plus the PVANC observer/scenario framework
 * (ten observer types) and the harness that drives a real PvancSession for
 * ground-truth recovery and negative-case analysis. Never shipped in production.
 * See README.md and ARCHITECTURE §8.
 */

export { PsychometricObserver } from './observers/psychometric-observer.ts';
export {
  SCENARIOS,
  makeResponder,
  PHONE_SIGNALS,
  type ObserverScenario,
} from './observers/pvanc-observers.ts';
export {
  runScenario,
  runScenarioMany,
  type ScenarioOutcome,
  type AggregateOutcome,
} from './harness/pvanc-harness.ts';
