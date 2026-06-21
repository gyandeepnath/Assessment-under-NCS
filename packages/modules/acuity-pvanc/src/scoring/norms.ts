/**
 * Age-stratified normative means (PVANC Appendix B).
 *
 * Approximate expected mean distance-acuity logMAR by age band, used only to
 * relax the screening category for older adults (never to tighten it). These are
 * conservative screening estimates, not validated population norms.
 */

interface NormBand {
  maxAge: number;
  meanLogMAR: number;
}

const NORMS: readonly NormBand[] = [
  { maxAge: 29, meanLogMAR: -0.02 },
  { maxAge: 39, meanLogMAR: 0.0 },
  { maxAge: 49, meanLogMAR: 0.05 },
  { maxAge: 59, meanLogMAR: 0.1 },
  { maxAge: 69, meanLogMAR: 0.16 },
  { maxAge: 79, meanLogMAR: 0.26 },
  { maxAge: 200, meanLogMAR: 0.38 },
];

/** Expected mean logMAR for an age, or undefined if age is not provided. */
export function expectedMeanLogMAR(age?: number): number | undefined {
  if (age === undefined) return undefined;
  for (const band of NORMS) {
    if (age <= band.maxAge) return band.meanLogMAR;
  }
  return undefined;
}
