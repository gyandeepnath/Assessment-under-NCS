/**
 * Storage contract — engine ⇄ data layer boundary (contract only).
 *
 * Three layered stores: append-only RAW → session summaries → longitudinal
 * aggregates. Higher layers are DERIVED and must be recomputable from the raw
 * layer + the module/spec/calibration versions that produced them. The engine
 * depends only on these repository interfaces; concrete adapters are swappable
 * (in-memory, sqlite, postgres-supabase).
 *
 * See docs/architecture/ARCHITECTURE.md §7.
 */

import type { UUID, SemVer, ISO8601 } from './units.ts';
import type { StimulusSpec, TrialOutcome, ModuleResult, ChangeAssessment, UseCase } from './module.contract.ts';
import type { ResponseEvent, DeviceSignals } from './platform.contract.ts';
import type { CalibrationProfile, DeviceProfile } from './calibration.contract.ts';
import type { QualityScore, QualityEvent, QualityFlag, PermittedOutput } from './quality.contract.ts';

export type SchemaVersion = string;

/** Immutable primary scientific record — one per trial (PVANC §14.1). */
export interface TrialRecord {
  trialId: UUID;
  sessionId: UUID;
  trialNumber: number;
  moduleId: string;
  moduleVersion: SemVer;
  specVersion: string;
  schemaVersion: SchemaVersion;
  calibrationProfileId: UUID;
  rngSeed: string;
  phase: string;
  stimulus: StimulusSpec; // incl. ground-truth identity + physical geometry/photometry
  response: ResponseEvent;
  outcome: TrialOutcome;
  procedureStateAfter: Record<string, number>;
  qualityEvents: QualityEvent[];
}

/** One per administration (PVANC §14.2). */
export interface SessionRecord {
  sessionId: UUID;
  userPseudonymId: string;
  moduleId: string;
  moduleVersion: SemVer;
  specVersion: string;
  schemaVersion: SchemaVersion;
  startedAt: ISO8601;
  calibrationProfile: CalibrationProfile;
  procedureConfig: Record<string, unknown>;
  result: ModuleResult;
  quality: QualityScore;
  baselineRef?: UUID;
  changeAssessment?: ChangeAssessment;
}

/**
 * Per-pseudonym longitudinal aggregate (PVANC §14.3). Distinct from the
 * module-facing `Baseline` (module.contract), which is the comparison input to a
 * single result; this is the persisted user-level record.
 */
export interface UserBaseline {
  userPseudonymId: string;
  establishedAt: ISO8601;
  estimate: number;
  interval?: [number, number];
  testCount: number;
}

// --- Repository ports (the only storage surface the engine sees) ---

export interface TrialRepository {
  append(t: TrialRecord): Promise<void>;
  bySession(id: UUID): Promise<TrialRecord[]>;
}

export interface SessionRepository {
  put(s: SessionRecord): Promise<void>;
  get(id: UUID): Promise<SessionRecord | null>;
  byUser(userPseudonymId: string): Promise<SessionRecord[]>;
}

export interface UserRepository {
  baseline(userPseudonymId: string): Promise<UserBaseline | null>;
  updateTrend(userPseudonymId: string, patch: Partial<UserBaseline>): Promise<void>;
}

export interface CalibrationRepository {
  put(p: CalibrationProfile): Promise<void>;
  get(id: UUID): Promise<CalibrationProfile | null>;
}

/** Self-describing raw + metadata bundle, recomputable off-device (§7.3). */
export interface ExportBundle {
  session: SessionRecord;
  trials: TrialRecord[];
  calibration: CalibrationProfile;
  format: 'json' | 'csv';
}

// ---------------------------------------------------------------------------
// Structured session export (the module data-output layer).
//
// A single, versioned document that keeps the seven required facets as DISTINCT
// top-level sections so nothing is hidden or overwritten: raw trials, session
// summary, reliability/confidence, calibration, QC, device, and version
// metadata. Designed to be lossless and directly usable in validation studies.
// See docs/architecture/ARCHITECTURE.md §7.3.
// ---------------------------------------------------------------------------

/** Version provenance — never silently overwritten; trials must agree with it. */
export interface VersionMetadata {
  moduleId: string;
  moduleVersion: SemVer;
  specVersion: string;
  dataSchemaVersion: SchemaVersion;
  exportSchemaVersion: string;
  engineContractVersion?: SemVer;
}

export interface TrialCounts {
  total: number;
  phase1: number;
  phase2: number;
  validPhase2: number;
  outliers: number;
}

/** Confidence/reliability output. */
export interface ReliabilityOutput {
  quality: QualityScore;
  permittedOutput: PermittedOutput;
  trialCounts: TrialCounts;
}

/** Session summary (identifiers, status, and the measurement result). */
export interface SessionSummary {
  sessionId: UUID;
  userPseudonymId: string;
  startedAt: ISO8601;
  status: 'completed' | 'inconclusive' | 'blocked';
  reason?: string;
  useCase: UseCase;
  procedureId: string;
  result: ModuleResult | null;
}

/** Device metadata: the resolved profile plus the raw signals as reported. */
export interface DeviceMetadata {
  profile: DeviceProfile;
  signals: DeviceSignals;
  profileSource?: string;
}

/** Environment metadata captured at session time. */
export interface EnvironmentMetadata {
  ambientLux: number | null;
  ambientAvailable: boolean;
  brightnessSetting: number | null;
  autoBrightness: 'on' | 'off' | 'unknown';
  darkMode: 'on' | 'off' | 'unknown';
  colourFilter: 'on' | 'off' | 'unknown';
  orientation: 'portrait' | 'landscape' | 'unknown';
  batteryLevel: number | null;
  capturedAt: ISO8601;
}

/** Quality-control metadata: gates, flags, and events (raw, not summarised away). */
export interface QcMetadata {
  blocked: boolean;
  blockReason?: string;
  completeness: { complete: boolean; reason?: string };
  preflightFlags: QualityFlag[];
  events: QualityEvent[];
  flagCounts: Record<string, number>;
}

/** The structured session export document. */
export interface SessionExport {
  kind: 'vision-assessment-session-export';
  exportSchemaVersion: string;
  generatedAt: ISO8601;
  versions: VersionMetadata;
  session: SessionSummary;
  reliability: ReliabilityOutput | null;
  device: DeviceMetadata;
  calibration: CalibrationProfile;
  environment: EnvironmentMetadata;
  qc: QcMetadata;
  /** Integrity: must equal trials.length. */
  trialCount: number;
  /** Raw trial-level data — always included in full. */
  trials: TrialRecord[];
}
