import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrialLog } from './trial-log.ts';
import type { TrialRecord } from '@vision-platform/core-contracts';

function makeTrial(n: number, sessionId = 's1'): TrialRecord {
  return {
    trialId: `t${n}`,
    sessionId,
    trialNumber: n,
    moduleId: 'mock',
    moduleVersion: '0.0.0',
    specVersion: 'MOCK-1.0',
    schemaVersion: '1',
    calibrationProfileId: 'cal1',
    rngSeed: 'seed',
    phase: 'measuring',
    stimulus: {
      kind: 'mock',
      intensity: 0 as never,
      geometry: {},
      photometry: { backgroundLuminance: 200 as never, contrast: 0.9 as never },
      identity: 'x',
      responseModel: { alternatives: 4, chanceRate: 0.25, allowedModalities: ['tap'] },
      timing: { interStimulusMs: 500, responseWindowMs: 5000 },
    },
    response: {
      stimulusId: `t${n}`,
      onsetTimestamp: 0 as never,
      responseTimestamp: 800 as never,
      latencyMs: 800,
      rawValue: 'x',
      inputModality: 'tap',
    },
    outcome: { correct: true, usableForThreshold: true },
    procedureStateAfter: {},
    qualityEvents: [],
  };
}

test('appends preserve order', () => {
  const log = new TrialLog();
  log.append(makeTrial(1));
  log.append(makeTrial(2));
  log.append(makeTrial(3));
  assert.deepEqual(
    log.all().map((t) => t.trialNumber),
    [1, 2, 3],
  );
  assert.equal(log.size, 3);
});

test('appended records are frozen (append-only, immutable)', () => {
  const log = new TrialLog();
  log.append(makeTrial(1));
  const t = log.all()[0]!;
  assert.throws(() => {
    (t as { trialNumber: number }).trialNumber = 99;
  }, TypeError);
  assert.equal(t.outcome.correct, true);
  assert.throws(() => {
    (t.outcome as { correct: boolean }).correct = false;
  }, TypeError); // deep freeze
});

test('bySession filters correctly', () => {
  const log = new TrialLog();
  log.append(makeTrial(1, 's1'));
  log.append(makeTrial(2, 's2'));
  log.append(makeTrial(3, 's1'));
  assert.equal(log.bySession('s1').length, 2);
  assert.equal(log.bySession('s2').length, 1);
});

test('listeners are notified on append and can unsubscribe', () => {
  const log = new TrialLog();
  let count = 0;
  const off = log.onTrial(() => count++);
  log.append(makeTrial(1));
  assert.equal(count, 1);
  off();
  log.append(makeTrial(2));
  assert.equal(count, 1);
});
