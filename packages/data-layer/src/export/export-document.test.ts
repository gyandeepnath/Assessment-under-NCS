import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_SCHEMA_VERSION,
  buildSessionExport,
  exportToJson,
  exportTrialsToCsv,
  exportSessionRowCsv,
  type BuildSessionExportInput,
} from './export-document.ts';
import type { TrialRecord, CalibrationProfile } from '@vision-platform/core-contracts';

function trial(n: number, raw = 'up'): TrialRecord {
  return {
    trialId: `s1-t${n}`,
    sessionId: 's1',
    trialNumber: n,
    moduleId: 'acuity-pvanc',
    moduleVersion: '1.0.0',
    specVersion: 'PVANC-1.0',
    schemaVersion: '1',
    calibrationProfileId: 's1-cal',
    rngSeed: 'seed:stim',
    phase: 'phase2_bayesian',
    stimulus: {
      kind: 'tumbling_e',
      intensity: 0.2 as never,
      geometry: {},
      photometry: { backgroundLuminance: 200 as never, contrast: 0.9 as never },
      identity: 'up',
      responseModel: { alternatives: 4, chanceRate: 0.25, allowedModalities: ['swipe'] },
      timing: { interStimulusMs: 500, responseWindowMs: 5000 },
    },
    response: {
      stimulusId: `s1-t${n}`,
      onsetTimestamp: 0 as never,
      responseTimestamp: 700 as never,
      latencyMs: 700,
      rawValue: raw,
      inputModality: 'swipe',
    },
    outcome: { correct: raw === 'up', usableForThreshold: true },
    procedureStateAfter: { threshold: 0.21, sd: 0.06 },
    qualityEvents: [],
  };
}

const calibration = { profileId: 's1-cal', viewingDistance: { value: 2, method: 'cord-measured' } } as unknown as CalibrationProfile;

function baseInput(trials: TrialRecord[]): BuildSessionExportInput {
  return {
    generatedAt: '2026-06-21T00:00:00.000Z',
    versions: { moduleId: 'acuity-pvanc', moduleVersion: '1.0.0', specVersion: 'PVANC-1.0', dataSchemaVersion: '1' },
    session: {
      sessionId: 's1',
      userPseudonymId: 'anon',
      startedAt: '2026-06-21T00:00:00.000Z',
      status: 'completed',
      useCase: 'screening',
      procedureId: 'pvanc-hybrid',
      result: {
        scale: 'logMAR',
        estimate: 0.21 as never,
        credibleInterval68: { min: 0.15 as never, max: 0.27 as never },
        category: 'within_expected',
        limitations: ['not BCVA'],
      },
    },
    reliability: {
      quality: { value: 70, band: 'moderate', components: {}, flags: [] },
      permittedOutput: 'trend-with-caveat',
      trialCounts: { total: trials.length, phase1: 0, phase2: trials.length, validPhase2: trials.length, outliers: 0 },
    },
    device: {
      profile: { deviceModel: 'iPhone16,1', pixelPitch: 0.055 as never, screenWidth: 70 as never, screenHeight: 153 as never, maxLuminance: 1000 as never, isFallback: false },
      signals: { deviceClass: 'smartphone', capturedAt: '2026-06-21T00:00:00.000Z' },
      profileSource: 'database',
    },
    calibration,
    environment: {
      ambientLux: 300,
      ambientAvailable: true,
      brightnessSetting: 80,
      autoBrightness: 'off',
      darkMode: 'off',
      colourFilter: 'off',
      orientation: 'portrait',
      batteryLevel: 0.9,
      capturedAt: '2026-06-21T00:00:00.000Z',
    },
    qc: { blocked: false, completeness: { complete: true }, preflightFlags: [], events: [], flagCounts: {} },
    trials,
  };
}

test('document has all seven facets as distinct top-level sections', () => {
  const doc = buildSessionExport(baseInput([trial(1), trial(2)]));
  assert.equal(doc.kind, 'vision-assessment-session-export');
  assert.equal(doc.exportSchemaVersion, EXPORT_SCHEMA_VERSION);
  for (const key of ['versions', 'session', 'reliability', 'device', 'calibration', 'environment', 'qc', 'trials']) {
    assert.ok(key in doc, `missing section: ${key}`);
  }
});

test('raw trials are never hidden: all trials included; trialCount matches', () => {
  const trials = [trial(1), trial(2), trial(3)];
  const doc = buildSessionExport(baseInput(trials));
  assert.equal(doc.trials.length, 3);
  assert.equal(doc.trialCount, 3);
});

test('version provenance is stamped with the export schema version', () => {
  const doc = buildSessionExport(baseInput([trial(1)]));
  assert.equal(doc.versions.exportSchemaVersion, EXPORT_SCHEMA_VERSION);
  assert.equal(doc.versions.moduleVersion, '1.0.0');
});

test('refuses to overwrite metadata: version conflict with a trial throws', () => {
  const bad = trial(1);
  (bad as { moduleVersion: string }).moduleVersion = '9.9.9'; // disagrees with the export
  assert.throws(() => buildSessionExport(baseInput([bad])), /version conflict on moduleVersion/);
});

test('JSON export is deterministic and lossless', () => {
  const doc = buildSessionExport(baseInput([trial(1)]));
  const a = exportToJson(doc);
  assert.equal(a, exportToJson(doc));
  const parsed = JSON.parse(a);
  assert.equal(parsed.trials[0].stimulus.identity, 'up');
  assert.equal(parsed.reliability.quality.value, 70);
});

test('raw trial CSV has a header and one row per trial, with provenance + posterior', () => {
  const csv = exportTrialsToCsv([trial(1, 'up'), trial(2, 'down')]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /^sessionId,trialId,trialNumber,phase/);
  assert.match(lines[0]!, /posteriorThreshold,posteriorSd,qualityEventCodes$/);
  assert.match(lines[1]!, /0\.21,0\.06/); // posterior state present
  assert.match(lines[2]!, /,false,true,/); // 'down' incorrect, usable
});

test('session-row CSV flattens one row for cross-session validation tables', () => {
  const doc = buildSessionExport(baseInput([trial(1)]));
  const csv = exportSessionRowCsv(doc);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /estimateLogMAR/);
  assert.match(lines[1]!, /s1,completed,1\.0\.0,PVANC-1\.0/);
  assert.match(lines[1]!, /0\.21/); // estimate present
});
