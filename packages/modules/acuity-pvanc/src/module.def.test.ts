import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pvancModule } from './module.def.ts';
import { asScale } from './scoring/logmar.ts';
import { createRng } from '@vision-platform/core-engine';
import type { ModuleResult, Baseline, ResponseEvent, Millis } from '@vision-platform/core-contracts';

test('manifest declares the construct, scale, and a non-clinical validation status', () => {
  assert.equal(pvancModule.manifest.moduleId, 'acuity-pvanc');
  assert.equal(pvancModule.manifest.scale, 'logMAR');
  assert.equal(pvancModule.manifest.validationStatus, 'provisional');
});

test('nextStimulus is pure/deterministic and scoreResponse compares to identity', () => {
  const req = { intensity: asScale(0.2), trialNumber: 1, phase: 'phase2_bayesian' };
  const s1 = pvancModule.nextStimulus(req, createRng('k'));
  const s2 = pvancModule.nextStimulus(req, createRng('k'));
  assert.equal(s1.identity, s2.identity);

  const correct: ResponseEvent = {
    stimulusId: 't1',
    onsetTimestamp: 0 as Millis,
    responseTimestamp: 800 as Millis,
    latencyMs: 800,
    rawValue: s1.identity,
    inputModality: 'swipe',
  };
  assert.equal(pvancModule.scoreResponse(s1, correct).correct, true);
  assert.equal(pvancModule.scoreResponse(s1, { ...correct, rawValue: 'definitely-wrong' }).correct, false);
});

test('anticipatory/timeout responses are not usable for threshold', () => {
  const req = { intensity: asScale(0.2), trialNumber: 1, phase: 'p' };
  const s = pvancModule.nextStimulus(req, createRng('k'));
  const fast = pvancModule.scoreResponse(s, mkResp(s.identity, 100));
  const slow = pvancModule.scoreResponse(s, mkResp(s.identity, 6000));
  assert.equal(fast.usableForThreshold, false);
  assert.equal(slow.usableForThreshold, false);
});

test('minimum detectable change varies by use case (PVANC §12.2)', () => {
  assert.equal(pvancModule.minimumDetectableChange('research') as unknown as number, 0.1);
  assert.equal(pvancModule.minimumDetectableChange('clinical-monitoring') as unknown as number, 0.18);
  assert.equal(pvancModule.minimumDetectableChange('screening') as unknown as number, 0.2);
});

test('compareToBaseline flags change beyond the MDC with a direction', () => {
  const current = { estimate: asScale(0.5) } as ModuleResult;
  const baseline: Baseline = { estimate: asScale(0.2) };
  const change = pvancModule.compareToBaseline(current, baseline);
  assert.ok(Math.abs((change.delta as unknown as number) - 0.3) < 1e-9);
  assert.equal(change.exceedsMdc, true);
  assert.equal(change.direction, 'worsening');

  const stable = pvancModule.compareToBaseline({ estimate: asScale(0.22) } as ModuleResult, baseline);
  assert.equal(stable.exceedsMdc, false);
  assert.equal(stable.direction, 'stable');
});

function mkResp(rawValue: string, latencyMs: number): ResponseEvent {
  return {
    stimulusId: 't',
    onsetTimestamp: 0 as Millis,
    responseTimestamp: latencyMs as Millis,
    latencyMs,
    rawValue,
    inputModality: 'swipe',
  };
}
