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

import type { UUID, SemVer, ISO8601 } from './units';
import type { StimulusSpec, TrialOutcome, ModuleResult, ChangeAssessment } from './module.contract';
import type { ResponseEvent } from './platform.contract';
import type { CalibrationProfile } from './calibration.contract';
import type { QualityScore, QualityEvent } from './quality.contract';

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

/** Per-pseudonym longitudinal aggregate (PVANC §14.3). */
export interface Baseline {
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
  baseline(userPseudonymId: string): Promise<Baseline | null>;
  updateTrend(userPseudonymId: string, patch: Partial<Baseline>): Promise<void>;
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
