/**
 * Quality scoring & confidence flags.
 *
 * The engine supplies a composable scoring framework: a weighted sum of 0–100
 * component scores → an overall 0–100 score → a band (high/moderate/low). Each
 * module supplies the component weights and band thresholds via a QualityModel,
 * keeping the engine construct-agnostic (ARCHITECTURE §6.1). An optional cap
 * (e.g. from the pixel-density adequacy gate) bounds the score from above.
 */

import type { QualityModel, QualityEvidence, QualityScore, QualityBand, QualityFlag } from '@vision-platform/core-contracts';

export interface ScoreOptions {
  /** Upper bound on the final score (e.g. adequacy quality cap). */
  cap?: number;
  /** Flags to attach (from pre-flight/in-flight checks). */
  flags?: QualityFlag[];
}

export function scoreQuality(model: QualityModel, evidence: QualityEvidence, opts: ScoreOptions = {}): QualityScore {
  const components: QualityScore['components'] = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, { weight }] of Object.entries(model.components)) {
    const raw = evidence[key];
    const value = clamp(raw ?? 0, 0, 100);
    components[key] = { weight, value };
    weightedSum += weight * value;
    totalWeight += weight;
  }

  if (totalWeight <= 0) throw new RangeError('quality model weights sum to zero');
  let score = weightedSum / totalWeight;
  if (opts.cap !== undefined) score = Math.min(score, opts.cap);
  score = clamp(score, 0, 100);

  return {
    value: round2(score),
    band: bandFor(score, model),
    components,
    flags: opts.flags ?? [],
  };
}

export function bandFor(score: number, model: QualityModel): QualityBand {
  if (score >= model.bandThresholds.high) return 'high';
  if (score >= model.bandThresholds.moderate) return 'moderate';
  return 'low';
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
