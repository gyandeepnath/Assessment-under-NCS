/**
 * logMAR scale: size range, notation conversions, and category assignment.
 *
 * The module measures in logMAR. The engine's adaptive procedures work in a
 * "strength" convention where higher = easier; for acuity that is satisfied
 * directly by using the optotype size in logMAR as the strength (a larger
 * optotype = higher logMAR size = easier), so the recovered threshold IS the
 * logMAR acuity. No transform is needed (PVANC §6, §9).
 */

import type { ScaleValue } from '@vision-platform/core-contracts';

/** Optotype size range and step (PVANC §7.2): +1.0 (20/200) to −0.3 (20/10). */
export const SIZE_MAX_LOGMAR = 1.0;
export const SIZE_MIN_LOGMAR = -0.3;
export const SIZE_STEP_LOGMAR = 0.1;

/** Category cut-offs (PVANC §9.4). */
export const WITHIN_EXPECTED_MAX = 0.3; // ≤0.30 → within expected (≥20/40)
export const BORDERLINE_MAX = 0.48; // 0.30–0.48 → borderline

export type PvancCategory = 'within_expected' | 'borderline' | 'below_expected' | 'inconclusive';

export function asScale(logMAR: number): ScaleValue {
  return logMAR as ScaleValue;
}

/** Discrete optotype sizes from largest to smallest, in 0.1 logMAR steps. */
export function sizeLevels(): number[] {
  const out: number[] = [];
  for (let s = SIZE_MAX_LOGMAR; s >= SIZE_MIN_LOGMAR - 1e-9; s -= SIZE_STEP_LOGMAR) {
    out.push(round2(s));
  }
  return out;
}

/** Finer grid for the QUEST+ threshold parameter (0.05 logMAR). */
export function thresholdGrid(step = 0.05): number[] {
  const out: number[] = [];
  for (let s = SIZE_MIN_LOGMAR; s <= SIZE_MAX_LOGMAR + 1e-9; s += step) {
    out.push(round2(s));
  }
  return out;
}

// --- Notation conversions (PVANC §9.2) ---

/** Snellen denominator in feet: 20 / D where D = 20 × 10^logMAR. */
export function snellenDenominatorFeet(logMAR: number): number {
  return Math.round(20 * Math.pow(10, logMAR));
}

export function snellenDenominatorMetres(logMAR: number): number {
  return Math.round(6 * Math.pow(10, logMAR));
}

/** Decimal acuity = 10^(−logMAR). */
export function decimalAcuity(logMAR: number): number {
  return round2(Math.pow(10, -logMAR));
}

/** ETDRS letter score (0–100): round((1.70 − logMAR) / 0.02). */
export function etdrsLetters(logMAR: number): number {
  return Math.round((1.7 - logMAR) / 0.02);
}

/**
 * Assign a screening category. For v1 a conservative universal threshold of
 * 0.30 logMAR is used (PVANC §9.4); an optional age-stratified mean may relax it
 * slightly for older adults, never tightening below the universal cut-off.
 */
export function assignCategory(logMAR: number, expectedMeanLogMAR?: number): PvancCategory {
  const withinMax =
    expectedMeanLogMAR !== undefined
      ? Math.max(WITHIN_EXPECTED_MAX, expectedMeanLogMAR + 0.2)
      : WITHIN_EXPECTED_MAX;
  if (logMAR <= withinMax) return 'within_expected';
  if (logMAR <= BORDERLINE_MAX) return 'borderline';
  return 'below_expected';
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
