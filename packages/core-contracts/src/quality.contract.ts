/**
 * Quality-control contract (contract only).
 *
 * The QC engine makes degradations VISIBLE and QUANTIFIED rather than hidden —
 * the mechanism by which the platform never trades accuracy for convenience.
 * The engine provides the scoring framework; each module supplies the weights
 * and component definitions.
 *
 * See docs/architecture/ARCHITECTURE.md §6.
 */

import type { ValidationStatus } from './module.contract.ts';

export type QualityBand = 'high' | 'moderate' | 'low';

export interface QualityFlag {
  code: string;
  severity: 'info' | 'warn' | 'degrade';
  message: string;
}

export interface QualityEvent {
  timestampMs: number;
  code: string;
  detail?: Record<string, unknown>;
}

export interface QualityComponent {
  weight: number; // 0..1
  value: number; // 0..100
}

export interface QualityScore {
  value: number; // 0..100
  band: QualityBand;
  components: Record<string, QualityComponent>;
  flags: QualityFlag[];
}

/** Module-supplied definition of how this construct's quality is scored. */
export interface QualityModel {
  components: Record<string, { weight: number }>;
  bandThresholds: { high: number; moderate: number };
}

export interface QualityEvidence {
  [componentKey: string]: number;
}

export type QualityVerdict =
  | { decision: 'allow' }
  | { decision: 'block'; reason: string }
  | { decision: 'flag'; flags: QualityFlag[] };

export interface CompletenessRule {
  minValidTrials: number;
  requireErrorAndCorrect: boolean;
}

export type CompletenessVerdict =
  | { complete: true }
  | { complete: false; reason: string };

/**
 * Claim gate (§6.4): permitted output is the MINIMUM of what quality allows and
 * what the module's validation status allows. The engine refuses any output
 * above the permitted level — structural prevention of unsupported claims.
 */
export type PermittedOutput =
  | 'full-category-share-trend'
  | 'trend-with-caveat'
  | 'numeric-research-only'
  | 'retake';

export interface ClaimGate {
  permit(band: QualityBand, status: ValidationStatus): PermittedOutput;
}

export interface QualityEngine {
  preflight(ctx: unknown): QualityVerdict;
  registerMonitors(session: unknown): unknown[];
  completeness(trials: unknown[], rule: CompletenessRule): CompletenessVerdict;
  score(model: QualityModel, evidence: QualityEvidence): QualityScore;
}
