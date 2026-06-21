/**
 * @vision-platform/module-acuity-pvanc — PVANC v1 (entry point).
 *
 * Implements the PVANC-1.0 spec on top of the shared measurement core. Exposes:
 *  - `pvancModule`: the pure `ModulePlugin` contract (stimulus construction,
 *    scoring, result derivation, MDC, baseline comparison, reference observer);
 *  - `PvancSession`: the §6.2 hybrid measurement controller that runs a full
 *    administration and emits the measurement + reliability outputs.
 *
 * The module imports only engine packages — never another module (isolation).
 */

import type {
  ModulePlugin,
  StimulusRequest,
  SeededRng,
  StimulusSpec,
  ResponseEvent,
  TrialOutcome,
  ResultInput,
  ModuleResult,
  EligibilityContext,
  EligibilityResult,
  ProcedureConfig,
  UseCase,
  ScaleDelta,
  ScaleValue,
  Baseline,
  ChangeAssessment,
  ObserverParams,
  VirtualObserver,
} from '@vision-platform/core-contracts';

import { PVANC_MANIFEST } from './manifest.ts';
import { buildTumblingE } from './stimulus/tumbling-e.ts';
import { scoreResponse } from './scoring/score-response.ts';
import { deriveResult } from './scoring/result.ts';
import { checkEligibility } from './eligibility.ts';
import { referenceObserver } from './observer-model/observer.ts';
import { asScale, sizeLevels, SIZE_MIN_LOGMAR, SIZE_MAX_LOGMAR } from './scoring/logmar.ts';

/** Minimum detectable change by use case (PVANC §12.2), in logMAR. */
const MDC_BY_USE_CASE: Record<UseCase, number> = {
  research: 0.1,
  'clinical-monitoring': 0.18,
  screening: 0.2,
};

function minimumDetectableChange(useCase: UseCase): ScaleDelta {
  return MDC_BY_USE_CASE[useCase] as unknown as ScaleDelta;
}

function compareToBaseline(current: ModuleResult, baseline: Baseline): ChangeAssessment {
  const cur = current.estimate as unknown as number;
  const base = baseline.estimate as unknown as number;
  const delta = cur - base; // positive = worse acuity
  const mdc = MDC_BY_USE_CASE['clinical-monitoring'];
  const exceeds = Math.abs(delta) >= mdc;
  const direction: ChangeAssessment['direction'] = !exceeds
    ? 'stable'
    : delta > 0
      ? 'worsening'
      : 'improving';
  return {
    delta: delta as unknown as ScaleDelta,
    exceedsMdc: exceeds,
    mdcUsed: mdc as unknown as ScaleDelta,
    direction,
  };
}

function configureProcedure(): ProcedureConfig {
  return {
    procedureId: 'pvanc-hybrid',
    parameters: { guessRate: 0.25, lapseRate: 0.02, slopePriorMean: 2.0, maxPhase2Trials: 30 },
    intensityRange: { min: asScale(SIZE_MIN_LOGMAR), max: asScale(SIZE_MAX_LOGMAR) },
  };
}

/** The pure module contract. Stateless; all methods are deterministic. */
export const pvancModule: ModulePlugin = {
  manifest: PVANC_MANIFEST,
  checkEligibility: (ctx: EligibilityContext): EligibilityResult => checkEligibility(ctx),
  configureProcedure: (): ProcedureConfig => configureProcedure(),
  nextStimulus: (req: StimulusRequest, rng: SeededRng): StimulusSpec => buildTumblingE(req, rng),
  scoreResponse: (stimulus: StimulusSpec, response: ResponseEvent): TrialOutcome =>
    scoreResponse(stimulus, response),
  deriveResult: (input: ResultInput): ModuleResult => deriveResult(input),
  minimumDetectableChange,
  compareToBaseline,
  referenceObserver: (params: ObserverParams): VirtualObserver => referenceObserver(params),
};

// Re-exports for hosts/tests.
export { PvancSession } from './session/pvanc-session.ts';
export type { PvancSessionConfig, PvancSessionResult, SessionStatus } from './session/pvanc-session.ts';
export { makePvancResponder, referenceObserver } from './observer-model/observer.ts';
export type { Responder, ResponseDraw, PvancObserverParams } from './observer-model/observer.ts';
export { ORIENTATIONS, wrongOrientation } from './stimulus/tumbling-e.ts';
export type { Orientation } from './stimulus/tumbling-e.ts';
export { PVANC_MANIFEST } from './manifest.ts';
export {
  asScale,
  sizeLevels,
  assignCategory,
  decimalAcuity,
  etdrsLetters,
  snellenDenominatorFeet,
  type PvancCategory,
} from './scoring/logmar.ts';
export { PVANC_LIMITATIONS } from './scoring/result.ts';
