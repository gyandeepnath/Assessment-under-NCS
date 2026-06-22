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

test('3. random-guesser: rejected, and the validity detector flags it (W5)', () => {
  const os = outcomes('random-guesser', 60);
  const inconclusive = os.filter((o) => o.status === 'inconclusive').length / os.length;
  assert.ok(inconclusive > 0.8, `inconclusive fraction ${inconclusive}`);
  // Never a confident "normal vision" reassurance.
  for (const o of os) {
    const falseReassurance = o.category === 'within_expected' && (o.quality ?? 0) >= 60;
    assert.equal(falseReassurance, false, `false reassurance in run: ${JSON.stringify(o)}`);
  }
  // The W5 detector is active: at least some guessers are explicitly flagged
  // invalid (the rest are caught by the floor/completeness gates → inconclusive).
  const flagged = os.filter((o) => o.flags.includes('invalid-response-pattern')).length;
  assert.ok(flagged >= 1, `expected the validity detector to flag some guessers, got ${flagged}`);
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
  // W5 safety regression: genuine low vision must NEVER be mislabelled as guessing.
  for (const o of outcomes('low-vision', 50)) {
    assert.equal(o.flags.includes('invalid-response-pattern'), false, `low vision wrongly flagged invalid: ${JSON.stringify(o)}`);
  }
});

test('7. device-constraint: result is marked device-limited, not a vision category (W4)', () => {
  const os = outcomes('device-constraint');
  for (const o of os) {
    assert.equal(o.adequacyPasses, false, 'adequacy should fail on a coarse device');
    assert.equal(o.qualityCap, 70, 'quality should be capped');
    // The result must NOT read as reduced eye acuity: category is suppressed and
    // a device-limited flag fires; the run is inconclusive → retake.
    assert.equal(o.status, 'inconclusive');
    assert.equal(o.category, 'inconclusive', 'must not assign a vision category');
    assert.ok(o.flags.includes('device-limited-result'), 'must flag device-limited');
    assert.equal(o.permittedOutput, 'retake');
    // The raw estimate is still present (not hidden).
    assert.notEqual(o.estimate, null);
  }
});

test('8. distance-error: corroboration catches the wrong distance (W2 fixed)', () => {
  const a = runScenarioMany(scenario('distance-error'), RUNS);
  // The underlying bias still exists (we cannot un-bias a wrong-distance render)...
  assert.ok(a.estimateBias! <= -0.08, `expected residual bias, got ${a.estimateBias}`);
  // ...but it is no longer presented confidently: distance quality collapses, the
  // disagreement is flagged, and the result is sent to retake.
  for (const o of outcomes('distance-error')) {
    assert.equal(o.distanceComponent, 0, 'distance quality should collapse on disagreement');
    assert.ok(o.flags.includes('distance-corroboration-disagreement'), 'disagreement must be flagged');
    assert.equal(o.permittedOutput, 'retake');
  }
});

test('uncorroborated distance is surfaced (no longer silently trusted)', () => {
  // A correct cord measurement still scores full distance quality, but the result
  // now carries an explicit "taken on trust" info flag (W2 transparency).
  for (const o of outcomes('noisy-attentive').filter((x) => x.status === 'completed')) {
    assert.ok(o.flags.includes('distance-uncorroborated'), 'uncorroborated distance should be flagged');
    assert.equal(o.distanceComponent, 100); // accurate cord measurement at 2 m
  }
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
