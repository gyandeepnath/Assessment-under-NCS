/**
 * @vision-platform/quality-engine — QC hooks, scoring, claim gating.
 *
 * Makes degradations visible and quantified, and structurally caps what a result
 * may claim. The engine provides the framework; modules supply construct-specific
 * policy (weights, thresholds). See README.md and ARCHITECTURE §6.
 */

export {
  QualityHookRegistry,
  toVerdict,
  type QualityCheck,
  type CheckResult,
  type AggregatedResult,
} from './hooks/hooks.ts';
export {
  darkModeCheck,
  colourFilterCheck,
  autoBrightnessCheck,
  illuminanceRangeCheck,
  lowBatteryCheck,
  latencyAnomalyCheck,
  type PreflightEnv,
  type TrialTimingContext,
} from './checks/checks.ts';
export { scoreQuality, bandFor, type ScoreOptions } from './scoring/scoring.ts';
export { claimGate } from './claim-gate/claim-gate.ts';
export { checkCompleteness } from './completeness/completeness.ts';
export {
  assessResponseValidity,
  type ValidityTrial,
  type ValidityConfig,
  type ValidityVerdict,
} from './validity/response-validity.ts';
