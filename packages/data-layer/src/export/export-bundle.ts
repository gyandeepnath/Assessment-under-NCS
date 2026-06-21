/**
 * Raw trial export.
 *
 * Produces a self-describing bundle — every trial plus the session summary and
 * the calibration profile — sufficient to recompute the result OFF-DEVICE
 * (ARCHITECTURE §7.3). Two formats: canonical JSON (lossless) and a flattened CSV
 * trial table for analysis. The exporter does not interpret data; it serialises
 * the immutable record so external tools can audit and re-derive.
 */

import type { TrialRecord, SessionRecord, CalibrationProfile, ExportBundle } from '@vision-platform/core-contracts';

export function buildExportBundle(
  session: SessionRecord,
  trials: readonly TrialRecord[],
  calibration: CalibrationProfile,
  format: 'json' | 'csv' = 'json',
): ExportBundle {
  return { session, trials: trials.slice(), calibration, format };
}

/** Canonical, lossless JSON (stable key order via replacer for reproducible diffs). */
export function toJson(bundle: ExportBundle): string {
  return JSON.stringify(bundle, sortedReplacer, 2);
}

/** Columns chosen to be stable and analysis-friendly. One row per trial. */
const CSV_COLUMNS = [
  'sessionId',
  'trialId',
  'trialNumber',
  'moduleId',
  'moduleVersion',
  'specVersion',
  'phase',
  'calibrationProfileId',
  'rngSeed',
  'stimulusKind',
  'intensity',
  'identity',
  'responseRaw',
  'latencyMs',
  'inputModality',
  'correct',
  'usableForThreshold',
] as const;

export function toCsv(trials: readonly TrialRecord[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = trials.map((t) =>
    [
      t.sessionId,
      t.trialId,
      t.trialNumber,
      t.moduleId,
      t.moduleVersion,
      t.specVersion,
      t.phase,
      t.calibrationProfileId,
      t.rngSeed,
      t.stimulus.kind,
      t.stimulus.intensity,
      t.stimulus.identity,
      t.response.rawValue,
      t.response.latencyMs,
      t.response.inputModality,
      t.outcome.correct,
      t.outcome.usableForThreshold,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

/** Serialise an export bundle to its declared format. */
export function serialize(bundle: ExportBundle): string {
  return bundle.format === 'csv' ? toCsv(bundle.trials) : toJson(bundle);
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  // Quote if the cell contains a delimiter, quote, or newline; escape quotes.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** JSON replacer that sorts object keys for deterministic, diff-friendly output. */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return value;
}
