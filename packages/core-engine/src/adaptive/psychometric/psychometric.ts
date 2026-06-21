/**
 * Psychometric functions.
 *
 * A psychometric function maps stimulus strength to the probability of a correct
 * response. The engine works in a "strength" convention: higher strength ⇒ easier
 * ⇒ higher P(correct). Each module maps its own scale onto strength (e.g. acuity
 * maps larger optotypes to higher strength), keeping the engine construct-agnostic.
 *
 *   P(correct | x) = γ + (1 − γ − δ) · F((x − μ) · β)
 *
 * where μ = threshold, β = slope, γ = guess rate (lower asymptote, 1/N for NAFC),
 * δ = lapse rate (upper-asymptote miss), and F is a sigmoidal core (probit/Weibull).
 * This is the standard form used in QUEST+/Psignifit and is NOT simplified away
 * (the platform must not replace psychophysical logic with shortcuts).
 */

export interface PsiParams {
  /** Threshold μ: strength at the sigmoid midpoint of F. */
  threshold: number;
  /** Slope β: steepness (1 / strength-unit). Must be > 0. */
  slope: number;
  /** Guess rate γ: lower asymptote, typically 1 / N for N-AFC. */
  guessRate: number;
  /** Lapse rate δ: upper-asymptote miss probability. */
  lapseRate: number;
}

export type PsychometricFn = (strength: number, p: PsiParams) => number;

/** Abramowitz & Stegun 7.1.26 erf approximation (|error| < 1.5e-7). */
export function erf(x: number): number {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function assertParams(p: PsiParams): void {
  if (p.slope <= 0) throw new RangeError('slope must be > 0');
  if (p.guessRate < 0 || p.lapseRate < 0 || p.guessRate + p.lapseRate >= 1) {
    throw new RangeError('require guessRate, lapseRate >= 0 and guessRate + lapseRate < 1');
  }
}

/** Cumulative-Gaussian (probit) psychometric function. */
export const cumulativeGaussian: PsychometricFn = (strength, p) => {
  assertParams(p);
  const f = normalCdf((strength - p.threshold) * p.slope);
  return p.guessRate + (1 - p.guessRate - p.lapseRate) * f;
};

/** Weibull psychometric function (defined for strength ≥ threshold region). */
export const weibull: PsychometricFn = (strength, p) => {
  assertParams(p);
  // Parameterised so μ marks the midpoint-ish location; uses exp form on (x-μ).
  const z = (strength - p.threshold) * p.slope;
  const f = 1 - Math.exp(-Math.exp(z));
  return p.guessRate + (1 - p.guessRate - p.lapseRate) * f;
};

/** Clamp a probability strictly inside (0,1) to keep log-likelihoods finite. */
export function clampProb(prob: number, eps = 1e-9): number {
  return Math.min(1 - eps, Math.max(eps, prob));
}
