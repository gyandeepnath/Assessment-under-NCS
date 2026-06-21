import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS } from './pvanc-observers.ts';
import { runScenario, runScenarioMany, type ScenarioOutcome } from '../harness/pvanc-harness.ts';

const RUNS = 30;

function scenario(id: string) {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) throw new Error(`unknown scenario ${id}`);
  return sc;
}

function outcomes(id: string, n = RUNS): ScenarioOutcome[] {
  const sc = scenario(id);
  return Array.from({ length: n }, (_, i) => runScenario(sc, `s${i}`));
}

test('every scenario declares expected behavior, output, and failure mode', () => {
  assert.equal(SCENARIOS.length, 10);
  for (const s of SCENARIOS) {
    assert.ok(s.expectedBehavior.length > 0, `${s.id} expectedBehavior`);
    assert.ok(s.expectedOutput.length > 0, `${s.id} expectedOutput`);
    assert.ok(s.failureLooksLike.length > 0, `${s.id} failureLooksLike`);
  }
});

test('1. ideal: converges, within-expected (small steep-slope bias documented)', () => {
  const a = runScenarioMany(scenario('ideal'), RUNS);
  assert.ok(a.completedFraction > 0.7, `completed ${a.completedFraction}`);
  // Steep slope (4) exceeds the spec slope prior's centre → modest negative bias.
  assert.ok(Math.abs(a.estimateBias!) < 0.2, `bias ${a.estimateBias}`);
  assert.ok(a.meanEstimate! < 0.2, `mean ${a.meanEstimate}`);
});

test('2. noisy-attentive: unbiased recovery at moderate quality (positive control)', () => {
  const a = runScenarioMany(scenario('noisy-attentive'), RUNS);
  assert.ok(Math.abs(a.estimateBias!) < 0.08, `bias ${a.estimateBias}`);
  assert.ok(a.rmse! < 0.2, `rmse ${a.rmse}`);
  assert.ok(a.completedFraction > 0.85, `completed ${a.completedFraction}`);
  assert.ok(a.meanQuality! >= 60 && a.meanQuality! < 85, `quality ${a.meanQuality}`);
});

test('3. random-guesser: never gives false reassurance', () => {
  const os = outcomes('random-guesser');
  const inconclusive = os.filter((o) => o.status === 'inconclusive').length / os.length;
  assert.ok(inconclusive > 0.8, `inconclusive fraction ${inconclusive}`);
  // The failure mode: a confident, normal-looking acuity. Must never happen.
  for (const o of os) {
    const falseReassurance = o.category === 'within_expected' && (o.quality ?? 0) >= 60;
    assert.equal(falseReassurance, false, `false reassurance in run: ${JSON.stringify(o)}`);
  }
});

test('4. fatigued: degrades (not better than true), flags timeouts, raises inconclusive rate', () => {
  const a = runScenarioMany(scenario('fatigued'), RUNS);
  // Estimate must not come out better than the (rested) true threshold.
  assert.ok(a.estimateBias! > -0.05, `bias ${a.estimateBias}`);
  assert.ok(a.completedFraction < 0.85, `too few inconclusive: ${a.completedFraction}`);
  const anyTimeout = outcomes('fatigued').some((o) => o.flags.includes('response-timeout'));
  assert.ok(anyTimeout, 'expected at least one response-timeout flag');
});

test('5. learning: estimate lands between early and late true thresholds', () => {
  const a = runScenarioMany(scenario('learning'), RUNS);
  assert.ok(a.meanEstimate! >= 0.18 && a.meanEstimate! <= 0.42, `mean ${a.meanEstimate}`);
  assert.ok(a.completedFraction > 0.8, `completed ${a.completedFraction}`);
});

test('6. low-vision: reports reduced acuity; never a false negative', () => {
  const os = outcomes('low-vision');
  const completed = os.filter((o) => o.status === 'completed');
  const mean = completed.reduce((s, o) => s + (o.estimate as number), 0) / completed.length;
  assert.ok(mean >= 0.6, `mean ${mean}`);
  for (const o of completed) {
    assert.notEqual(o.category, 'within_expected', `false negative: ${JSON.stringify(o)}`);
  }
});

test('7. device-constraint: adequacy fails and caps quality (device-limited, not eye-limited)', () => {
  const os = outcomes('device-constraint');
  for (const o of os) {
    assert.equal(o.adequacyPasses, false, 'adequacy should fail on a coarse device');
    assert.equal(o.qualityCap, 70, 'quality should be capped');
    assert.ok((o.quality ?? 100) <= 70, `quality not capped: ${o.quality}`);
    // Must not report an impossibly good acuity below what the device can render.
    if (o.estimate !== null) assert.ok(o.estimate > 0.2, `implausibly good on coarse device: ${o.estimate}`);
  }
});

test('8. distance-error: produces a confident, UNDETECTED bias (weakness)', () => {
  const a = runScenarioMany(scenario('distance-error'), RUNS);
  // Subject closer than assumed ⇒ reported better than true.
  assert.ok(a.estimateBias! <= -0.08, `expected better-than-true bias, got ${a.estimateBias}`);
  // The weakness: distance-stability quality stays at maximum despite the wrong distance.
  assert.equal(a.sample.distanceComponent, 100);
});

test('9. brightness-variation: small worse-than-true bias AND an auto-brightness flag', () => {
  const os = outcomes('brightness-variation');
  for (const o of os.filter((x) => x.status === 'completed')) {
    assert.ok(o.flags.includes('auto-brightness'), 'auto-brightness must be flagged');
  }
  const a = runScenarioMany(scenario('brightness-variation'), RUNS);
  assert.ok(a.estimateBias! > -0.03, `should not be better than true: ${a.estimateBias}`);
});

test('10. calibration-drift: small bias, silently UNDETECTED in a single session', () => {
  const a = runScenarioMany(scenario('calibration-drift'), RUNS);
  assert.ok(Math.abs(a.estimateBias!) < 0.12, `bias ${a.estimateBias}`);
  // No in-session signal (per PVANC §10.4, drift needs cross-session tracking).
  assert.equal(a.sample.adequacyPasses, true);
  assert.equal(a.sample.flags.includes('auto-brightness'), false);
});
