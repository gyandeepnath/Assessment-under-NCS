/**
 * PVANC quality model & evidence (PVANC §9.3).
 *
 * The engine's quality-engine provides the weighted-composition framework; this
 * module supplies the five components and weights, and computes each component's
 * 0–100 evidence from the session. The result is the reliability/confidence
 * output that accompanies the measurement.
 */

import type { QualityModel } from '@vision-platform/core-contracts';

/** Five components and weights from PVANC §9.3; bands from §9.3 thresholds. */
export const PVANC_QUALITY_MODEL: QualityModel = {
  components: {
    precision: { weight: 0.3 },
    trialCount: { weight: 0.2 },
    consistency: { weight: 0.2 },
    distance: { weight: 0.15 },
    environment: { weight: 0.15 },
  },
  bandThresholds: { high: 80, moderate: 60 },
};

export interface QualityInputs {
  posteriorSd: number;
  phase2Trials: number;
  outlierFraction: number; // fraction of trials flagged anticipatory/timeout
  // Distance CONFIDENCE (not raw method): incorporates corroboration so a
  // disagreeing/uncorroborated distance is not treated as "confirmed stable".
  distanceConfidence: 'high' | 'moderate' | 'low';
  ambientAvailable: boolean;
  ambientLux: number | null;
}

const ILLUMINANCE_MIN = 50;
const ILLUMINANCE_MAX = 1000;

/** Compute 0–100 evidence per component (PVANC §9.3 formulas). */
export function computeQualityEvidence(inp: QualityInputs): Record<string, number> {
  // Precision: full if posterior SD < 0.05 logMAR, else 100·max(0, 1 − SD/0.10).
  const precision = inp.posteriorSd < 0.05 ? 100 : 100 * Math.max(0, 1 - inp.posteriorSd / 0.1);

  // Trial-count adequacy: 100·min(trials/30, 1).
  const trialCount = 100 * Math.min(inp.phase2Trials / 30, 1);

  // Response consistency: 100·(1 − outlier fraction).
  const consistency = 100 * (1 - clamp01(inp.outlierFraction));

  // Distance stability (PVANC §9.3): confirmed = 100, estimated = 50, unknown = 0,
  // mapped from confidence so corroboration disagreement (which lowers confidence)
  // pulls this component down instead of trusting the declared method.
  const distance = inp.distanceConfidence === 'high' ? 100 : inp.distanceConfidence === 'moderate' ? 50 : 0;

  // Environmental compliance: in range = 100, unknown = 50, out of range = 0.
  let environment: number;
  if (!inp.ambientAvailable || inp.ambientLux === null) environment = 50;
  else if (inp.ambientLux >= ILLUMINANCE_MIN && inp.ambientLux <= ILLUMINANCE_MAX) environment = 100;
  else environment = 0;

  return { precision, trialCount, consistency, distance, environment };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
