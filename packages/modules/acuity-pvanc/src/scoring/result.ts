/**
 * Result derivation (PVANC §9.1, §9.4, §15).
 *
 * Turns the QUEST+ terminal posterior into the module's reported result: logMAR
 * estimate, 68%/95% credible intervals, screening category, and the MANDATORY
 * limitations that must travel with every result to prevent unsupported claims.
 */

import type { ResultInput, ModuleResult, ScaleRange } from '@vision-platform/core-contracts';
import { asScale, assignCategory, type PvancCategory } from './logmar.ts';

/** Disclaimers attached to every result (PVANC §3, §15, §16). */
export const PVANC_LIMITATIONS: readonly string[] = [
  'Measures presenting acuity with habitual correction — not best-corrected visual acuity.',
  'Does not diagnose eye disease; a normal result does not exclude sight-threatening conditions.',
  'Assesses central vision only; does not assess peripheral field, colour, or binocular function.',
  'Not for legal, certification, occupational, or treatment decisions.',
  'Not clinically validated against ETDRS; for screening and self-monitoring support only.',
];

export interface DeriveOptions {
  /** Expected mean logMAR for the user's age band, if known (relaxes category only). */
  expectedMeanLogMAR?: number;
  /** Mark the result inconclusive (e.g. floored or failed completeness). */
  inconclusive?: boolean;
}

export function deriveResult(input: ResultInput, opts: DeriveOptions = {}): ModuleResult {
  const estimate = input.terminalEstimate as unknown as number;
  const sd = input.posteriorSummary?.thresholdSd ?? Number.NaN;

  const category: PvancCategory = opts.inconclusive
    ? 'inconclusive'
    : assignCategory(estimate, opts.expectedMeanLogMAR);

  const ci68 = Number.isFinite(sd) ? interval(estimate, sd) : undefined;
  const ci95 = Number.isFinite(sd) ? interval(estimate, 1.96 * sd) : undefined;

  return {
    scale: 'logMAR',
    estimate: asScale(round2(estimate)),
    ...(ci68 ? { credibleInterval68: ci68 } : {}),
    ...(ci95 ? { credibleInterval95: ci95 } : {}),
    category,
    limitations: [...PVANC_LIMITATIONS],
  };
}

function interval(mean: number, halfWidth: number): ScaleRange {
  return { min: asScale(round2(mean - halfWidth)), max: asScale(round2(mean + halfWidth)) };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
