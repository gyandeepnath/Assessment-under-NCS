/**
 * PVANC measurement session — the §6.2 hybrid adaptive procedure.
 *
 * Phase 1 (staircase) brackets the threshold quickly; Phase 2 (QUEST+) refines it
 * with a Bayesian posterior seeded by the Phase 1 estimate. The session composes
 * the shared measurement core (RNG, timing, trial log, staircase, QUEST+), the
 * calibration engine, and the quality engine, producing a measurement output plus
 * a reliability/confidence output. Every trial is logged.
 *
 * This phase sequencing is part of the module's scientific spec, so it lives with
 * the module; the generic session-lifecycle orchestrator (engine, deferred) will
 * later host cross-cutting concerns around it. The module imports only engine
 * packages — never another module (isolation, ARCHITECTURE §0.3).
 */

import {
  createRng,
  StimulusTimer,
  TrialLog,
  Staircase,
  QuestPlus,
  type EngineRng,
} from '@vision-platform/core-engine';
import {
  resolveDeviceProfile,
  acquireDistance,
  distanceConfidence,
  adequacy,
  captureEnvironment,
  pixelsPerDegree,
  type ResolvedDeviceProfile,
  type EnvironmentSnapshot,
} from '@vision-platform/calibration-engine';
import {
  QualityHookRegistry,
  toVerdict,
  darkModeCheck,
  colourFilterCheck,
  autoBrightnessCheck,
  illuminanceRangeCheck,
  lowBatteryCheck,
  latencyAnomalyCheck,
  scoreQuality,
  claimGate,
  checkCompleteness,
  type PreflightEnv,
} from '@vision-platform/quality-engine';
import {
  buildSessionExport,
  exportToJson,
  exportTrialsToCsv,
} from '@vision-platform/data-layer';
import type {
  DeviceSignals,
  DistanceMethod,
  UseCase,
  TrialRecord,
  ResponseEvent,
  StimulusSpec,
  TrialOutcome,
  ModuleResult,
  QualityScore,
  QualityEvent,
  QualityFlag,
  CalibrationProfile,
  PermittedOutput,
  Millis,
  Candela,
  SessionExport,
  SessionSummary,
  ReliabilityOutput,
  DeviceMetadata,
  EnvironmentMetadata,
  QcMetadata,
  TrialCounts,
  VersionMetadata,
} from '@vision-platform/core-contracts';

import { buildTumblingE, strokeArcmin } from '../stimulus/tumbling-e.ts';
import { scoreResponse } from '../scoring/score-response.ts';
import { deriveResult } from '../scoring/result.ts';
import { PVANC_QUALITY_MODEL, computeQualityEvidence } from '../scoring/quality.ts';
import { expectedMeanLogMAR } from '../scoring/norms.ts';
import { checkEligibility } from '../eligibility.ts';
import { asScale, sizeLevels, thresholdGrid, SIZE_MAX_LOGMAR, SIZE_MIN_LOGMAR } from '../scoring/logmar.ts';
import { PVANC_MANIFEST } from '../manifest.ts';
import type { Responder } from '../observer-model/observer.ts';

export interface PvancSessionConfig {
  sessionId: string;
  userPseudonymId?: string;
  seed: string;
  deviceSignals: DeviceSignals;
  distance: { method: DistanceMethod; valueMetres: number };
  age?: number;
  useCase?: UseCase;
  maxPhase1Trials?: number;
  maxPhase2Trials?: number;
  stopSd?: number;
}

export type SessionStatus = 'completed' | 'blocked' | 'inconclusive';

export interface PvancSessionResult {
  status: SessionStatus;
  reason?: string;
  result: ModuleResult | null;
  quality: QualityScore | null;
  permittedOutput: PermittedOutput;
  calibrationProfile: CalibrationProfile;
  trials: readonly TrialRecord[];
  /** The structured data-output document (the seven-facet session export). */
  export: SessionExport;
  /** Canonical JSON serialisation of `export`. */
  exportJson: string;
  /** Raw trial-level CSV (one row per trial). */
  trialsCsv: string;
}

const FLOOR_CONSECUTIVE_ERRORS = 5; // PVANC §6.2 floor detection
const MIN_VALID_PHASE2_TRIALS = 15; // PVANC §11.3

export class PvancSession {
  private readonly cfg: PvancSessionConfig;
  private readonly stimRng: EngineRng;
  private readonly log = new TrialLog();
  private readonly timer: StimulusTimer;
  private nowMs = 0;
  private trialNumber = 0;
  // Captured during run() so the export can report device/environment/QC metadata
  // without recomputation (and without overwriting what was actually used).
  private resolvedDevice!: ResolvedDeviceProfile;
  private environment!: EnvironmentSnapshot;
  private preflightFlags: QualityFlag[] = [];

  constructor(cfg: PvancSessionConfig) {
    this.cfg = cfg;
    this.stimRng = createRng(`${cfg.seed}:stim`);
    this.timer = new StimulusTimer(
      { now: () => this.nowMs as Millis },
      { interStimulusMs: 500, responseWindowMs: 5000, anticipationMs: 200 },
    );
  }

  run(responder: Responder): PvancSessionResult {
    this.environment = captureEnvironment(this.cfg.deviceSignals);
    const env = this.environment;
    const calibration = this.buildCalibration();

    // --- Eligibility (may block) ---
    const elig = checkEligibility({
      deviceClass: this.cfg.deviceSignals.deviceClass,
      ...(this.cfg.age !== undefined ? { selfReportedAge: this.cfg.age } : {}),
    });
    if (elig.decision === 'block') {
      return this.blocked(`eligibility: ${elig.reason}`, calibration);
    }

    // --- Pre-flight quality control (may block) ---
    const preEnv: PreflightEnv = {
      darkMode: env.darkMode,
      colourFilter: env.colourFilter,
      autoBrightness: env.autoBrightness,
      ambientLux: env.ambientLux,
      ambientAvailable: env.ambientAvailable,
      batteryLevel: env.batteryLevel,
    };
    const preflight = new QualityHookRegistry<PreflightEnv>()
      .register(darkModeCheck)
      .register(colourFilterCheck)
      .register(autoBrightnessCheck)
      .register(illuminanceRangeCheck())
      .register(lowBatteryCheck())
      .run('preflight', preEnv);
    if (preflight.blocked) {
      return this.blocked(`pre-flight: ${preflight.blockReasons.join('; ')}`, calibration);
    }
    this.preflightFlags = [...preflight.flags];
    const flags: QualityFlag[] = [...preflight.flags];

    // --- Phase 1: staircase bracketing ---
    const bracket = this.runPhase1(responder, calibration.profileId, flags);
    if (bracket.floored) {
      return this.finish('inconclusive', calibration, flags, {
        terminalLogMAR: SIZE_MAX_LOGMAR,
        posteriorSd: 1.0,
        phase2Valid: [],
        outlierFraction: bracket.outlierFraction,
        inconclusive: true,
        reason: 'could not identify even the largest optotype (floor reached)',
      });
    }

    // --- Phase 2: QUEST+ refinement (seeded by the Phase 1 observations) ---
    const refine = this.runPhase2(responder, calibration.profileId, bracket.observations, flags);

    const completeness = checkCompleteness(refine.outcomes, {
      minValidTrials: MIN_VALID_PHASE2_TRIALS,
      requireErrorAndCorrect: true,
    });
    const inconclusive = !completeness.complete || refine.floored;

    return this.finish(inconclusive ? 'inconclusive' : 'completed', calibration, flags, {
      terminalLogMAR: refine.estimate,
      posteriorSd: refine.floored ? 1.0 : refine.sd,
      phase2Valid: refine.outcomes,
      outlierFraction: refine.outlierFraction,
      inconclusive,
      ...(completeness.complete ? {} : { reason: completeness.reason }),
      ...(refine.floored ? { reason: 'floor reached during refinement' } : {}),
    });
  }

  // --- Phases ---------------------------------------------------------------

  private runPhase1(
    responder: Responder,
    profileId: string,
    flags: QualityFlag[],
  ): { observations: Phase1Obs[]; floored: boolean; outlierFraction: number } {
    const staircase = new Staircase({
      startStrength: SIZE_MAX_LOGMAR,
      nDown: 1,
      nUp: 1,
      stepSize: 0.1,
      minStrength: SIZE_MIN_LOGMAR,
      maxStrength: SIZE_MAX_LOGMAR,
      maxReversals: 1,
      maxTrials: this.cfg.maxPhase1Trials ?? 12,
      reversalsForThreshold: 1,
    });

    const observations: Phase1Obs[] = [];
    let consecutiveErrors = 0;
    let outliers = 0;
    let count = 0;
    while (!staircase.isDone()) {
      // Round to the optotype grid so the value matches the QUEST+ stimulus domain
      // (the staircase accumulates floating-point error).
      const intensity = round2(staircase.nextStrength);
      const pt = this.presentTrial(intensity, 'phase1_bracketing', responder, flags);
      count++;
      if (pt.isOutlier) outliers++;
      observations.push({ size: intensity, correct: pt.outcome.correct, usable: pt.outcome.usableForThreshold });
      this.logTrial(pt, profileId, 'phase1_bracketing', { strength: intensity, reversals: staircase.reversalCount });

      consecutiveErrors = pt.outcome.correct ? 0 : consecutiveErrors + 1;
      if (consecutiveErrors >= FLOOR_CONSECUTIVE_ERRORS) {
        return { observations, floored: true, outlierFraction: outliers / count };
      }
      staircase.update(pt.outcome.correct);
    }

    return { observations, floored: false, outlierFraction: count ? outliers / count : 0 };
  }

  private runPhase2(
    responder: Responder,
    profileId: string,
    phase1Obs: Phase1Obs[],
    flags: QualityFlag[],
  ): { estimate: number; sd: number; outcomes: TrialOutcome[]; floored: boolean; outlierFraction: number } {
    // Uniform prior over threshold (the core procedure is unbiased); a weak prior
    // over slope (PVANC §6.2: prior mean 2.0, SD 0.5). The Phase 1 trials are valid
    // observations, so they are replayed into the posterior to accelerate Phase 2
    // without biasing the estimate.
    const quest = new QuestPlus({
      stimulusDomain: sizeLevels(),
      thresholdGrid: thresholdGrid(0.05),
      slopeGrid: [1.0, 1.5, 2.0, 2.5, 3.0, 4.0],
      guessRate: 0.25,
      lapseRate: 0.02,
      priorSlope: gaussianPrior(2.0, 0.5),
      stopSd: this.cfg.stopSd ?? 0.05,
      maxTrials: this.cfg.maxPhase2Trials ?? 30,
    });
    for (const obs of phase1Obs) {
      if (obs.usable) quest.update(obs.size, obs.correct);
    }

    // Phase 2 trial budget and stopping rule are counted over the ADAPTIVE trials
    // only (PVANC §6.2: up to 30 Phase 2 trials, or posterior SD < 0.05 logMAR);
    // the replayed Phase 1 trials do not consume the Phase 2 budget.
    const maxPhase2 = this.cfg.maxPhase2Trials ?? 30;
    const stopSd = this.cfg.stopSd ?? 0.05;

    const outcomes: TrialOutcome[] = [];
    let consecutiveErrors = 0;
    let outliers = 0;
    let count = 0;

    while (count < maxPhase2 && quest.estimate().thresholdSd >= stopSd) {
      const intensity = quest.nextStimulus();
      const pt = this.presentTrial(intensity, 'phase2_bayesian', responder, flags);
      count++;
      if (pt.isOutlier) outliers++;
      outcomes.push(pt.outcome);

      // Update the posterior, then log the post-update state with the trial.
      if (pt.outcome.usableForThreshold) quest.update(intensity, pt.outcome.correct);
      const est = quest.estimate();
      this.logTrial(pt, profileId, 'phase2_bayesian', { threshold: est.threshold, sd: est.thresholdSd });

      consecutiveErrors = pt.outcome.correct ? 0 : consecutiveErrors + 1;
      if (consecutiveErrors >= FLOOR_CONSECUTIVE_ERRORS) {
        const e = quest.estimate();
        return { estimate: e.threshold, sd: e.thresholdSd, outcomes, floored: true, outlierFraction: outliers / count };
      }
    }

    const est = quest.estimate();
    return { estimate: est.threshold, sd: est.thresholdSd, outcomes, floored: false, outlierFraction: count ? outliers / count : 0 };
  }

  // --- Trial mechanics ------------------------------------------------------

  private presentTrial(
    intensity: number,
    phase: string,
    responder: Responder,
    flags: QualityFlag[],
  ): PresentedTrial {
    this.trialNumber += 1;
    const trialId = `${this.cfg.sessionId}-t${this.trialNumber}`;
    const stimulus = buildTumblingE(
      { intensity: asScale(intensity), trialNumber: this.trialNumber, phase },
      this.stimRng,
    );

    const onset = this.nowMs;
    const draw = responder(stimulus);
    const responseAt = onset + draw.latencyMs;
    const timing = this.timer.classify(onset as Millis, responseAt as Millis);

    const responseEvent: ResponseEvent = {
      stimulusId: trialId,
      onsetTimestamp: onset as Millis,
      responseTimestamp: responseAt as Millis,
      latencyMs: draw.latencyMs,
      rawValue: draw.rawValue,
      inputModality: modalityFor(this.cfg.deviceSignals.deviceClass),
    };

    // Timeout is recorded as an error and is unusable (PVANC §6.5).
    const baseOutcome = scoreResponse(stimulus, responseEvent);
    const outcome: TrialOutcome =
      timing.classification === 'timeout' ? { correct: false, usableForThreshold: false } : baseOutcome;

    // In-flight QC: latency anomalies become quality events + flags.
    const qualityEvents: QualityEvent[] = [];
    const check = latencyAnomalyCheck.run({ classification: timing.classification });
    if (check.kind === 'flag') {
      qualityEvents.push({ timestampMs: responseAt, code: check.flag.code, detail: { trialId } });
      flags.push(check.flag);
    }

    this.nowMs = responseAt + 500; // enforce inter-stimulus interval

    return {
      trialNumber: this.trialNumber,
      trialId,
      stimulus,
      responseEvent,
      outcome,
      isOutlier: timing.classification !== 'valid',
      qualityEvents,
    };
  }

  private logTrial(
    pt: PresentedTrial,
    profileId: string,
    phase: string,
    procedureStateAfter: Record<string, number>,
  ): void {
    const record: TrialRecord = {
      trialId: pt.trialId,
      sessionId: this.cfg.sessionId,
      trialNumber: pt.trialNumber,
      moduleId: PVANC_MANIFEST.moduleId,
      moduleVersion: PVANC_MANIFEST.moduleVersion,
      specVersion: PVANC_MANIFEST.specVersion,
      schemaVersion: '1',
      calibrationProfileId: profileId,
      rngSeed: `${this.cfg.seed}:stim`,
      phase,
      stimulus: pt.stimulus,
      response: pt.responseEvent,
      outcome: pt.outcome,
      procedureStateAfter,
      qualityEvents: pt.qualityEvents,
    };
    this.log.append(record);
  }

  // --- Calibration ----------------------------------------------------------

  private buildCalibration(): CalibrationProfile {
    const deviceProfile = resolveDeviceProfile(this.cfg.deviceSignals);
    this.resolvedDevice = deviceProfile;
    const viewingDistance = acquireDistance(this.cfg.distance.method, this.cfg.distance.valueMetres);

    // Adequacy is judged against the finest stroke we intend to measure (best acuity).
    const report = adequacy({
      device: deviceProfile,
      distance: viewingDistance,
      requiredDetailArcmin: strokeArcmin(SIZE_MIN_LOGMAR),
      minPixelsPerDetail: 2,
    });
    const maxMeasurableLogMAR = Math.log10(report.limitArcmin);

    const dConf = distanceConfidence(viewingDistance);
    const confidence: CalibrationProfile['confidence'] =
      !report.passes || deviceProfile.isFallback ? 'low' : dConf;

    return {
      profileId: `${this.cfg.sessionId}-cal`,
      deviceProfile,
      viewingDistance,
      // v1 makes no photometric correction; luminance is the nominal target.
      luminance: { target: 200 as Candela, achieved: 200 as Candela, residualError: 0 as Candela },
      adequacy: {
        passes: report.passes,
        pixelsPerDegree: pixelsPerDegree(deviceProfile, viewingDistance),
        maxMeasurable: round2(maxMeasurableLogMAR),
        ...(report.qualityCap !== undefined ? { qualityCap: report.qualityCap } : {}),
      },
      capturedAt: this.cfg.deviceSignals.capturedAt,
      confidence,
    };
  }

  // --- Output assembly ------------------------------------------------------

  private finish(
    status: SessionStatus,
    calibration: CalibrationProfile,
    flags: QualityFlag[],
    args: {
      terminalLogMAR: number;
      posteriorSd: number;
      phase2Valid: TrialOutcome[];
      outlierFraction: number;
      inconclusive: boolean;
      reason?: string;
    },
  ): PvancSessionResult {
    const result = deriveResult(
      {
        terminalEstimate: asScale(args.terminalLogMAR),
        posteriorSummary: { thresholdSd: args.posteriorSd },
        trials: args.phase2Valid,
      },
      {
        inconclusive: args.inconclusive,
        ...expectedMeanOpt(this.cfg.age),
      },
    );

    const evidence = computeQualityEvidence({
      posteriorSd: args.posteriorSd,
      phase2Trials: args.phase2Valid.length,
      outlierFraction: args.outlierFraction,
      distanceMethod: calibration.viewingDistance.method,
      ambientAvailable: this.environment.ambientAvailable,
      ambientLux: this.environment.ambientLux,
    });
    const quality = scoreQuality(PVANC_QUALITY_MODEL, evidence, {
      flags,
      ...(calibration.adequacy.qualityCap !== undefined ? { cap: calibration.adequacy.qualityCap } : {}),
    });

    const permittedOutput: PermittedOutput = args.inconclusive
      ? 'retake'
      : claimGate.permit(quality.band, PVANC_MANIFEST.validationStatus);

    const trials = this.log.all() as TrialRecord[];
    const counts = this.trialCounts(trials);
    const reliability: ReliabilityOutput = { quality, permittedOutput, trialCounts: counts };

    const summary: SessionSummary = {
      sessionId: this.cfg.sessionId,
      userPseudonymId: this.cfg.userPseudonymId ?? 'anonymous',
      startedAt: this.cfg.deviceSignals.capturedAt,
      status,
      ...(args.reason ? { reason: args.reason } : {}),
      useCase: this.cfg.useCase ?? 'screening',
      procedureId: 'pvanc-hybrid',
      result,
    };

    const qc: QcMetadata = {
      blocked: false,
      completeness: { complete: status === 'completed', ...(args.reason ? { reason: args.reason } : {}) },
      preflightFlags: this.preflightFlags,
      events: trials.flatMap((t) => t.qualityEvents),
      flagCounts: tallyFlags(quality.flags),
    };

    const doc = buildSessionExport({
      generatedAt: this.cfg.deviceSignals.capturedAt,
      versions: this.versionMetadata(),
      session: summary,
      reliability,
      device: this.deviceMetadata(),
      calibration,
      environment: this.environmentMetadata(),
      qc,
      trials,
    });

    return {
      status,
      ...(args.reason ? { reason: args.reason } : {}),
      result,
      quality,
      permittedOutput,
      calibrationProfile: calibration,
      trials,
      export: doc,
      exportJson: exportToJson(doc),
      trialsCsv: exportTrialsToCsv(trials),
    };
  }

  private blocked(reason: string, calibration: CalibrationProfile): PvancSessionResult {
    const trials = this.log.all() as TrialRecord[];
    const summary: SessionSummary = {
      sessionId: this.cfg.sessionId,
      userPseudonymId: this.cfg.userPseudonymId ?? 'anonymous',
      startedAt: this.cfg.deviceSignals.capturedAt,
      status: 'blocked',
      reason,
      useCase: this.cfg.useCase ?? 'screening',
      procedureId: 'pvanc-hybrid',
      result: null,
    };
    const qc: QcMetadata = {
      blocked: true,
      blockReason: reason,
      completeness: { complete: false, reason },
      preflightFlags: this.preflightFlags,
      events: trials.flatMap((t) => t.qualityEvents),
      flagCounts: {},
    };
    const doc = buildSessionExport({
      generatedAt: this.cfg.deviceSignals.capturedAt,
      versions: this.versionMetadata(),
      session: summary,
      reliability: null,
      device: this.deviceMetadata(),
      calibration,
      environment: this.environmentMetadata(),
      qc,
      trials,
    });

    return {
      status: 'blocked',
      reason,
      result: null,
      quality: null,
      permittedOutput: 'retake',
      calibrationProfile: calibration,
      trials,
      export: doc,
      exportJson: exportToJson(doc),
      trialsCsv: exportTrialsToCsv(trials),
    };
  }

  // --- Metadata assembly ----------------------------------------------------

  private versionMetadata(): Omit<VersionMetadata, 'exportSchemaVersion'> {
    return {
      moduleId: PVANC_MANIFEST.moduleId,
      moduleVersion: PVANC_MANIFEST.moduleVersion,
      specVersion: PVANC_MANIFEST.specVersion,
      dataSchemaVersion: '1',
      engineContractVersion: PVANC_MANIFEST.engineApiRange,
    };
  }

  private deviceMetadata(): DeviceMetadata {
    return {
      profile: this.resolvedDevice,
      signals: this.cfg.deviceSignals,
      profileSource: this.resolvedDevice.source,
    };
  }

  private environmentMetadata(): EnvironmentMetadata {
    return this.environment;
  }

  private trialCounts(trials: readonly TrialRecord[]): TrialCounts {
    const phase1 = trials.filter((t) => t.phase === 'phase1_bracketing').length;
    const phase2Trials = trials.filter((t) => t.phase === 'phase2_bayesian');
    const validPhase2 = phase2Trials.filter((t) => t.outcome.usableForThreshold).length;
    const outliers = trials.filter((t) => t.qualityEvents.length > 0).length;
    return { total: trials.length, phase1, phase2: phase2Trials.length, validPhase2, outliers };
  }
}

interface Phase1Obs {
  size: number;
  correct: boolean;
  usable: boolean;
}

interface PresentedTrial {
  trialNumber: number;
  trialId: string;
  stimulus: StimulusSpec;
  responseEvent: ResponseEvent;
  outcome: TrialOutcome;
  isOutlier: boolean;
  qualityEvents: QualityEvent[];
}

/** Build the optional `expectedMeanLogMAR` field only when a norm exists. */
function expectedMeanOpt(age: number | undefined): { expectedMeanLogMAR?: number } {
  const exp = expectedMeanLogMAR(age);
  return exp !== undefined ? { expectedMeanLogMAR: exp } : {};
}

function tallyFlags(flags: readonly QualityFlag[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of flags) counts[f.code] = (counts[f.code] ?? 0) + 1;
  return counts;
}

function gaussianPrior(mean: number, sd: number): (x: number) => number {
  return (x) => Math.exp(-0.5 * ((x - mean) / sd) ** 2);
}

function modalityFor(deviceClass: string): ResponseEvent['inputModality'] {
  if (deviceClass === 'desktop') return 'key';
  if (deviceClass === 'smartphone' || deviceClass === 'tablet') return 'swipe';
  return 'tap';
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
