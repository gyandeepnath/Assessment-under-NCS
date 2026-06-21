import { test } from 'node:test';
import assert from 'node:assert/strict';
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
} from './index.ts';
import type { QualityModel, TrialOutcome } from '@vision-platform/core-contracts';

const goodEnv: PreflightEnv = {
  darkMode: 'off',
  colourFilter: 'off',
  autoBrightness: 'off',
  ambientLux: 300,
  ambientAvailable: true,
  batteryLevel: 0.8,
};

test('hooks: dark mode and colour filter block; clean env allows', () => {
  const reg = new QualityHookRegistry<PreflightEnv>()
    .register(darkModeCheck)
    .register(colourFilterCheck)
    .register(autoBrightnessCheck)
    .register(illuminanceRangeCheck())
    .register(lowBatteryCheck());

  assert.equal(toVerdict(reg.run('preflight', goodEnv)).decision, 'allow');

  const blocked = reg.run('preflight', { ...goodEnv, darkMode: 'on' });
  assert.equal(toVerdict(blocked).decision, 'block');
});

test('hooks: out-of-range light and auto-brightness flag without blocking', () => {
  const reg = new QualityHookRegistry<PreflightEnv>()
    .register(autoBrightnessCheck)
    .register(illuminanceRangeCheck(50, 1000));
  const res = reg.run('preflight', { ...goodEnv, autoBrightness: 'on', ambientLux: 5 });
  const verdict = toVerdict(res);
  assert.equal(verdict.decision, 'flag');
  assert.equal(res.flags.length, 2);
});

test('hooks: missing ambient sensor yields an info flag, not a block', () => {
  const reg = new QualityHookRegistry<PreflightEnv>().register(illuminanceRangeCheck());
  const res = reg.run('preflight', { ...goodEnv, ambientAvailable: false, ambientLux: null });
  assert.equal(res.flags[0]?.severity, 'info');
  assert.equal(res.blocked, false);
});

test('hooks: in-flight latency anomalies flag', () => {
  assert.equal(latencyAnomalyCheck.run({ classification: 'valid' }).kind, 'pass');
  assert.equal(latencyAnomalyCheck.run({ classification: 'anticipatory' }).kind, 'flag');
  assert.equal(latencyAnomalyCheck.run({ classification: 'timeout' }).kind, 'flag');
});

const model: QualityModel = {
  components: {
    precision: { weight: 0.3 },
    trialCount: { weight: 0.2 },
    consistency: { weight: 0.2 },
    distance: { weight: 0.15 },
    environment: { weight: 0.15 },
  },
  bandThresholds: { high: 80, moderate: 60 },
};

test('scoring: weighted sum, banding, clamping', () => {
  const high = scoreQuality(model, { precision: 100, trialCount: 100, consistency: 100, distance: 100, environment: 100 });
  assert.equal(high.value, 100);
  assert.equal(high.band, 'high');

  const low = scoreQuality(model, { precision: 20, trialCount: 30, consistency: 40, distance: 0, environment: 50 });
  assert.equal(low.band, 'low');
});

test('scoring: adequacy cap bounds the score from above', () => {
  const capped = scoreQuality(
    model,
    { precision: 100, trialCount: 100, consistency: 100, distance: 100, environment: 100 },
    { cap: 70 },
  );
  assert.equal(capped.value, 70);
  assert.equal(capped.band, 'moderate');
});

test('claim gate takes the minimum of quality band and validation status', () => {
  assert.equal(claimGate.permit('high', 'validated'), 'full-category-share-trend');
  assert.equal(claimGate.permit('high', 'research-only'), 'numeric-research-only');
  assert.equal(claimGate.permit('low', 'validated'), 'retake');
  assert.equal(claimGate.permit('moderate', 'provisional'), 'trend-with-caveat');
  assert.equal(claimGate.permit('moderate', 'research-only'), 'numeric-research-only');
});

test('completeness: enforces minimum valid trials and an error+correct pair', () => {
  const rule = { minValidTrials: 3, requireErrorAndCorrect: true };
  const mk = (correct: boolean, usable = true): TrialOutcome => ({ correct, usableForThreshold: usable });

  assert.equal(checkCompleteness([mk(true), mk(true)], rule).complete, false); // too few
  assert.equal(checkCompleteness([mk(true), mk(true), mk(true)], rule).complete, false); // no error
  assert.equal(checkCompleteness([mk(true), mk(false), mk(true)], rule).complete, true);
  // unusable trials do not count toward the minimum
  assert.equal(checkCompleteness([mk(true, false), mk(false), mk(true)], rule).complete, false);
});
