/**
 * Module Plug-in contract — engine ⇄ module boundary (contract only).
 *
 * A module is a declarative specification of a construct plus the PURE functions
 * the engine needs to measure it. The engine drives the loop; the module supplies
 * knowledge. Modules are passive: they do not own the session, clock, storage, or
 * rendering, and they never import another module.
 *
 * See docs/architecture/ARCHITECTURE.md §3.
 */

import type {
  SemVer,
  SemVerRange,
  ScaleValue,
  ScaleDelta,
  ScaleRange,
  Degrees,
  Candela,
  WeberContrast,
  CieColour,
} from './units';
import type { DeviceClass, DeviceSignalKind, ResponseEvent } from './platform.contract';

/** Evidence-driven status that bounds what a module may claim (§6.4, §9.4). */
export type ValidationStatus = 'research-only' | 'provisional' | 'validated';

export interface ModuleManifest {
  moduleId: string;
  construct: string;
  scale: string;
  specVersion: string;
  moduleVersion: SemVer;
  engineApiRange: SemVerRange;
  scientificRisk: 'LOW' | 'MODERATE' | 'HIGH';
  referenceStandard?: string;
  supportedDeviceClasses: DeviceClass[];
  requiredCalibration: string[]; // CalibrationRequirement ids (see calibration.contract)
  requiredSignals: DeviceSignalKind[];
  validationStatus: ValidationStatus;
  defaultProcedure: string; // ProcedureId from the engine's adaptive library
}

// --- Stimulus / response value types (physical units, not pixels) ---

export interface GeometrySpec {
  /** Sizes/positions expressed in degrees of visual angle. */
  [key: string]: Degrees;
}

export interface PhotometrySpec {
  backgroundLuminance: Candela;
  contrast: WeberContrast;
  colour?: CieColour;
}

export interface FlankerSpec {
  spacing: Degrees;
  thickness: Degrees;
  length: Degrees;
}

export interface TimingSpec {
  presentationMs?: number; // undefined = self-paced
  interStimulusMs: number;
  responseWindowMs: number;
}

export interface ResponseModelSpec {
  alternatives: number;
  chanceRate: number; // 1 / alternatives, unless otherwise modelled
  allowedModalities: string[];
}

export interface StimulusSpec {
  kind: string; // module-defined, e.g. "tumbling_e"
  intensity: ScaleValue; // on the module's scale
  geometry: GeometrySpec;
  photometry: PhotometrySpec;
  identity: string; // ground-truth answer; never sent to UI as a hint
  flankers?: FlankerSpec;
  responseModel: ResponseModelSpec;
  timing: TimingSpec;
}

export interface StimulusRequest {
  intensity: ScaleValue; // chosen by the adaptive procedure
  trialNumber: number;
  phase: string;
}

export interface TrialOutcome {
  correct: boolean;
  category?: string;
  usableForThreshold: boolean;
}

// --- Result derivation ---

export interface ModuleResult {
  scale: string;
  estimate: ScaleValue;
  credibleInterval68?: ScaleRange;
  credibleInterval95?: ScaleRange;
  category?: string;
  /** Limitations text that MUST travel with the result (§6.4). */
  limitations: string[];
}

export interface ResultInput {
  terminalEstimate: ScaleValue;
  posteriorSummary?: Record<string, number>;
  trials: TrialOutcome[];
}

export type UseCase = 'research' | 'clinical-monitoring' | 'screening';

export interface Baseline {
  estimate: ScaleValue;
  interval?: ScaleRange;
}

export interface ChangeAssessment {
  delta: ScaleDelta;
  exceedsMdc: boolean;
  mdcUsed: ScaleDelta;
  direction: 'stable' | 'improving' | 'worsening' | 'uncertain';
}

// --- Simulation support (see simulation.contract) ---
export interface ObserverParams {
  trueThreshold: ScaleValue;
  slope: number;
  lapseRate: number;
  guessRate: number;
}

/**
 * The module plug-in. Every method is PURE and deterministic given its inputs
 * and the injected SeededRng. No I/O, no clock reads, no rendering.
 */
export interface ModulePlugin {
  readonly manifest: ModuleManifest;

  checkEligibility(ctx: EligibilityContext): EligibilityResult;
  configureProcedure(cal: unknown /* CalibrationProfile */): ProcedureConfig;
  nextStimulus(req: StimulusRequest, rng: SeededRng): StimulusSpec;
  scoreResponse(stimulus: StimulusSpec, response: ResponseEvent): TrialOutcome;
  deriveResult(input: ResultInput): ModuleResult;

  minimumDetectableChange(useCase: UseCase): ScaleDelta;
  compareToBaseline(current: ModuleResult, baseline: Baseline): ChangeAssessment;

  referenceObserver(params: ObserverParams): VirtualObserver;
}

// --- Supporting contract types (kept minimal at the skeleton stage) ---

export interface EligibilityContext {
  selfReportedAge?: number;
  deviceClass: DeviceClass;
  ambientLux?: number;
  [key: string]: unknown;
}

export type EligibilityResult =
  | { decision: 'allow' }
  | { decision: 'block'; reason: string }
  | { decision: 'proceed-with-flags'; flags: string[] };

export interface ProcedureConfig {
  procedureId: string;
  parameters: Record<string, number>;
  intensityRange: ScaleRange;
}

/** Re-declared minimally here to avoid a hard import cycle in the skeleton. */
export interface SeededRng {
  next(): number;
  int(maxExclusive: number): number;
}

export interface VirtualObserver {
  respond(stimulus: StimulusSpec, rng: SeededRng): ResponseEvent;
  readonly groundTruth: ObserverParams;
}
