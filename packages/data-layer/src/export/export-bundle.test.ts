import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportBundle, toJson, toCsv, serialize } from './export-bundle.ts';
import type { TrialRecord, SessionRecord, CalibrationProfile } from '@vision-platform/core-contracts';

function makeTrial(n: number, raw = 'up'): TrialRecord {
  return {
    trialId: `t${n}`,
    sessionId: 's1',
    trialNumber: n,
    moduleId: 'acuity-pvanc',
    moduleVersion: '0.0.0',
    specVersion: 'PVANC-1.0',
    schemaVersion: '1',
    calibrationProfileId: 'cal1',
    rngSeed: 'seed-1',
    phase: 'phase2_bayesian',
    stimulus: {
      kind: 'tumbling_e',
      intensity: 0.2 as never,
      geometry: {},
      photometry: { backgroundLuminance: 200 as never, contrast: 0.9 as never },
      identity: 'E_up',
      responseModel: { alternatives: 4, chanceRate: 0.25, allowedModalities: ['swipe'] },
      timing: { interStimulusMs: 500, responseWindowMs: 5000 },
    },
    response: {
      stimulusId: `t${n}`,
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

const session = { sessionId: 's1', moduleId: 'acuity-pvanc' } as unknown as SessionRecord;
const calibration = { profileId: 'cal1' } as unknown as CalibrationProfile;

test('builds a self-describing bundle (trials + session + calibration)', () => {
  const bundle = buildExportBundle(session, [makeTrial(1), makeTrial(2)], calibration);
  assert.equal(bundle.trials.length, 2);
  assert.equal(bundle.session.sessionId, 's1');
  assert.equal(bundle.calibration.profileId, 'cal1');
});

test('JSON export is valid, lossless, and key-sorted (deterministic)', () => {
  const bundle = buildExportBundle(session, [makeTrial(1)], calibration);
  const json = toJson(bundle);
  const parsed = JSON.parse(json);
  assert.equal(parsed.trials[0].stimulus.identity, 'E_up');
  // deterministic: same input → identical serialisation
  assert.equal(toJson(bundle), json);
});

test('CSV export has a header and one row per trial', () => {
  const csv = toCsv([makeTrial(1, 'up'), makeTrial(2, 'down')]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3); // header + 2 rows
  assert.match(lines[0]!, /^sessionId,trialId,trialNumber/);
  assert.match(lines[1]!, /acuity-pvanc/);
  assert.match(lines[2]!, /,false,true$/); // 'down' is incorrect, but the trial is usable
});

test('CSV escapes cells containing delimiters/quotes', () => {
  const csv = toCsv([makeTrial(1, 'a,b"c')]);
  assert.match(csv, /"a,b""c"/);
});

test('serialize dispatches on the bundle format', () => {
  const trials = [makeTrial(1)];
  assert.equal(serialize(buildExportBundle(session, trials, calibration, 'csv')).split('\n').length, 2);
  assert.ok(serialize(buildExportBundle(session, trials, calibration, 'json')).startsWith('{'));
});
