/**
 * Viewing-distance handling.
 *
 * Distance is the dominant error source in display-based acuity-type measurement
 * (ARCHITECTURE §14 R2). The engine therefore treats the acquisition METHOD as a
 * first-class fact and attaches a method-specific uncertainty to every estimate,
 * which propagates into the quality score. Camera-based estimation is explicitly
 * marked uncertain and is never silently trusted.
 */

import type { DistanceEstimate, DistanceMethod, Metres } from '@vision-platform/core-contracts';

/** Default 1-sigma uncertainty (metres) per acquisition method. */
const METHOD_UNCERTAINTY_M: Readonly<Record<DistanceMethod, number>> = {
  'cord-measured': 0.02, // physical tether: most reliable
  'user-reported': 0.1, // self-estimated: coarse
  'camera-estimated': 0.05, // [UNCERTAIN] — varies by device/lighting
  unknown: 0.5, // effectively unusable; large penalty downstream
};

export interface AcquireDistanceOptions {
  /** Override the default uncertainty (e.g. a device-validated camera figure). */
  uncertaintyM?: number;
  /** An independent second reading to corroborate the primary distance. */
  corroboration?: { valueMetres: number; method: DistanceMethod };
}

/** Tolerance for agreement between two distance readings (the larger of these). */
const CORROBORATION_ABS_TOL_M = 0.05;
const CORROBORATION_REL_TOL = 0.04;

export function acquireDistance(
  method: DistanceMethod,
  valueMetres: number,
  opts: AcquireDistanceOptions = {},
): DistanceEstimate {
  if (method !== 'unknown' && (!(valueMetres > 0) || !Number.isFinite(valueMetres))) {
    throw new RangeError(`viewing distance must be a positive finite number, got ${valueMetres}`);
  }
  let uncertainty = opts.uncertaintyM ?? METHOD_UNCERTAINTY_M[method];

  let corroboration: DistanceEstimate['corroboration'];
  if (opts.corroboration) {
    const cv = opts.corroboration.valueMetres;
    if (!(cv > 0) || !Number.isFinite(cv)) {
      throw new RangeError(`corroborating distance must be a positive finite number, got ${cv}`);
    }
    const disagreementM = Math.abs(valueMetres - cv);
    const tol = Math.max(CORROBORATION_ABS_TOL_M, CORROBORATION_REL_TOL * valueMetres);
    const agrees = disagreementM <= tol;
    // Disagreement is evidence the primary distance is wrong: widen uncertainty to
    // at least the disagreement so confidence and quality reflect it.
    if (!agrees) uncertainty = Math.max(uncertainty, disagreementM);
    corroboration = {
      value: cv as Metres,
      method: opts.corroboration.method,
      disagreementM: disagreementM as Metres,
      agrees,
    };
  }

  return {
    value: valueMetres as Metres,
    method,
    uncertainty: uncertainty as Metres,
    ...(corroboration ? { corroboration } : {}),
  };
}

/** Relative uncertainty (fraction of distance) — a convenient quality input. */
export function relativeUncertainty(estimate: DistanceEstimate): number {
  if (estimate.value <= 0) return Number.POSITIVE_INFINITY;
  return estimate.uncertainty / estimate.value;
}

/** Confidence tier from relative uncertainty, used to grade the calibration profile. */
export function distanceConfidence(estimate: DistanceEstimate): 'high' | 'moderate' | 'low' {
  const rel = relativeUncertainty(estimate);
  if (rel <= 0.015) return 'high';
  if (rel <= 0.04) return 'moderate';
  return 'low';
}
