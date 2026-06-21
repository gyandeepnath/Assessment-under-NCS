/**
 * Structured session export — the module data-output layer (ARCHITECTURE §7.3).
 *
 * Assembles one versioned, self-describing document with the seven required
 * facets as distinct top-level sections (raw trials, session summary,
 * reliability, calibration, QC, device, version metadata) and serialises it for
 * validation studies. Two guarantees enforced here:
 *   - raw data is never hidden: every trial is included in full;
 *   - metadata is never silently overwritten: version provenance is validated
 *     against the trials, and any mismatch throws rather than being papered over.
 */

import type {
  SessionExport,
  VersionMetadata,
  SessionSummary,
  ReliabilityOutput,
  DeviceMetadata,
  EnvironmentMetadata,
  QcMetadata,
  CalibrationProfile,
  TrialRecord,
  ISO8601,
} from '@vision-platform/core-contracts';

/** The export document schema version. Bump on any breaking shape change. */
export const EXPORT_SCHEMA_VERSION = '1.0.0';

export interface BuildSessionExportInput {
  generatedAt: ISO8601;
  versions: Omit<VersionMetadata, 'exportSchemaVersion'>;
  session: SessionSummary;
  reliability: ReliabilityOutput | null;
  device: DeviceMetadata;
  calibration: CalibrationProfile;
  environment: EnvironmentMetadata;
  qc: QcMetadata;
  trials: readonly TrialRecord[];
}

export function buildSessionExport(input: BuildSessionExportInput): SessionExport {
  const versions: VersionMetadata = { ...input.versions, exportSchemaVersion: EXPORT_SCHEMA_VERSION };

  // Guard: version metadata must agree with every trial. Surface conflicts; do
  // not overwrite. (Mixing module/spec/schema versions in one export would make
  // the data scientifically ambiguous.)
  for (const t of input.trials) {
    assertAgrees('moduleId', t.trialId, t.moduleId, versions.moduleId);
    assertAgrees('moduleVersion', t.trialId, t.moduleVersion, versions.moduleVersion);
    assertAgrees('specVersion', t.trialId, t.specVersion, versions.specVersion);
    assertAgrees('schemaVersion', t.trialId, t.schemaVersion, versions.dataSchemaVersion);
  }

  const trials = input.trials.slice();
  const doc: SessionExport = {
    kind: 'vision-assessment-session-export',
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    versions,
    session: input.session,
    reliability: input.reliability,
    device: input.device,
    calibration: input.calibration,
    environment: input.environment,
    qc: input.qc,
    trialCount: trials.length,
    trials,
  };
  return doc;
}

/** Canonical, deterministic JSON (key-sorted) — lossless and diff-friendly. */
export function exportToJson(doc: SessionExport): string {
  return JSON.stringify(doc, sortedReplacer, 2);
}

/** Raw trial-level CSV: one row per trial, with provenance and posterior state. */
const TRIAL_COLUMNS = [
  'sessionId',
  'trialId',
  'trialNumber',
  'phase',
  'moduleId',
  'moduleVersion',
  'specVersion',
  'schemaVersion',
  'calibrationProfileId',
  'rngSeed',
  'stimulusKind',
  'intensity',
  'identity',
  'responseValue',
  'inputModality',
  'onsetTimestamp',
  'responseTimestamp',
  'latencyMs',
  'correct',
  'usableForThreshold',
  'posteriorThreshold',
  'posteriorSd',
  'qualityEventCodes',
] as const;

export function exportTrialsToCsv(trials: readonly TrialRecord[]): string {
  const header = TRIAL_COLUMNS.join(',');
  const rows = trials.map((t) =>
    [
      t.sessionId,
      t.trialId,
      t.trialNumber,
      t.phase,
      t.moduleId,
      t.moduleVersion,
      t.specVersion,
      t.schemaVersion,
      t.calibrationProfileId,
      t.rngSeed,
      t.stimulus.kind,
      t.stimulus.intensity,
      t.stimulus.identity,
      t.response.rawValue,
      t.response.inputModality,
      t.response.onsetTimestamp,
      t.response.responseTimestamp,
      t.response.latencyMs,
      t.outcome.correct,
      t.outcome.usableForThreshold,
      t.procedureStateAfter['threshold'] ?? '',
      t.procedureStateAfter['sd'] ?? '',
      t.qualityEvents.map((e) => e.code).join('|'),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

/**
 * One-row-per-session CSV for cross-session validation tables (Bland-Altman,
 * ICC, etc.). Flattens the key measurement + reliability + context fields.
 */
const SESSION_COLUMNS = [
  'sessionId',
  'status',
  'moduleVersion',
  'specVersion',
  'exportSchemaVersion',
  'estimateLogMAR',
  'ci68Low',
  'ci68High',
  'ci95Low',
  'ci95High',
  'category',
  'qualityScore',
  'qualityBand',
  'permittedOutput',
  'totalTrials',
  'validPhase2',
  'deviceModel',
  'deviceClass',
  'distanceM',
  'distanceMethod',
  'ambientLux',
] as const;

export function exportSessionRowCsv(doc: SessionExport): string {
  const r = doc.session.result;
  const rel = doc.reliability;
  const row = [
    doc.session.sessionId,
    doc.session.status,
    doc.versions.moduleVersion,
    doc.versions.specVersion,
    doc.versions.exportSchemaVersion,
    num(r?.estimate),
    num(r?.credibleInterval68?.min),
    num(r?.credibleInterval68?.max),
    num(r?.credibleInterval95?.min),
    num(r?.credibleInterval95?.max),
    r?.category ?? '',
    rel?.quality.value ?? '',
    rel?.quality.band ?? '',
    rel?.permittedOutput ?? '',
    rel?.trialCounts.total ?? '',
    rel?.trialCounts.validPhase2 ?? '',
    doc.device.profile.deviceModel,
    doc.device.signals.deviceClass,
    doc.calibration.viewingDistance.value,
    doc.calibration.viewingDistance.method,
    doc.environment.ambientLux ?? '',
  ];
  return [SESSION_COLUMNS.join(','), row.map(csvCell).join(',')].join('\n');
}

function assertAgrees(field: string, trialId: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `export version conflict on ${field}: trial ${trialId} has "${String(actual)}" but the export declares "${String(expected)}"`,
    );
  }
}

function num(v: unknown): number | '' {
  return typeof v === 'number' ? v : '';
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return value;
}
