import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PvancSession, type PvancSessionConfig } from '../module.def.ts';
import { makePvancResponder, type Responder } from '../observer-model/observer.ts';
import { createRng } from '@vision-platform/core-engine';
import type { DeviceSignals } from '@vision-platform/core-contracts';

const NOW = '2026-06-21T00:00:00.000Z';

function phoneSignals(overrides: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    deviceModel: 'iPhone16,1',
    deviceClass: 'smartphone',
    ambientLux: 300,
    darkMode: 'off',
    colourFilter: 'off',
    autoBrightness: 'off',
    batteryLevel: 0.9,
    capturedAt: NOW,
    ...overrides,
  };
}

function baseConfig(overrides: Partial<PvancSessionConfig> = {}): PvancSessionConfig {
  return {
    sessionId: 'S1',
    seed: 'seed',
    deviceSignals: phoneSignals(),
    distance: { method: 'cord-measured', valueMetres: 2 },
    age: 30,
    ...overrides,
  };
}

test('recovers a known acuity (unbiased over seeds) and reports two outputs', () => {
  const truth = 0.3;
  const estimates: number[] = [];
  for (let s = 0; s < 24; s++) {
    const session = new PvancSession(baseConfig({ sessionId: `S${s}`, seed: `seed${s}` }));
    const r = session.run(makePvancResponder({ trueLogMAR: truth }, createRng(`obs${s}`)));
    assert.equal(r.status, 'completed');
    estimates.push(r.result!.estimate as unknown as number);
  }
  const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  const rmse = Math.sqrt(estimates.reduce((a, b) => a + (b - truth) ** 2, 0) / estimates.length);
  assert.ok(Math.abs(mean - truth) < 0.06, `biased: ${mean.toFixed(3)}`);
  assert.ok(rmse < 0.25, `rmse too high: ${rmse.toFixed(3)}`);
});

test('produces a measurement output and a reliability/confidence output', () => {
  const session = new PvancSession(baseConfig());
  const r = session.run(makePvancResponder({ trueLogMAR: 0.2 }, createRng('obs')));

  // Measurement output
  assert.equal(r.result!.scale, 'logMAR');
  assert.ok(r.result!.credibleInterval68);
  assert.ok(r.result!.limitations.length >= 5);

  // Reliability/confidence output: five components + band + claim gate
  assert.ok(r.quality);
  assert.deepEqual(
    Object.keys(r.quality!.components).sort(),
    ['consistency', 'distance', 'environment', 'precision', 'trialCount'],
  );
  assert.ok(r.quality!.value >= 0 && r.quality!.value <= 100);
  // provisional module + moderate/high band ⇒ trend-with-caveat (never full clinical claim)
  assert.equal(r.permittedOutput, 'trend-with-caveat');
});

test('logs every trial with full provenance, and the raw export round-trips', () => {
  const session = new PvancSession(baseConfig());
  const r = session.run(makePvancResponder({ trueLogMAR: 0.3 }, createRng('obs')));

  assert.ok(r.trials.length >= 20, `too few trials: ${r.trials.length}`);
  for (const t of r.trials) {
    assert.equal(t.moduleId, 'acuity-pvanc');
    assert.equal(t.specVersion, 'PVANC-1.0');
    assert.ok(t.stimulus && t.response && t.outcome);
    assert.ok(t.calibrationProfileId.length > 0);
    assert.ok(['phase1_bracketing', 'phase2_bayesian'].includes(t.phase));
  }
  const parsed = JSON.parse(r.exportJson);
  assert.equal(parsed.trials.length, r.trials.length);
  assert.equal(parsed.trialCount, r.trials.length);
  assert.equal(parsed.versions.moduleId, 'acuity-pvanc');
});

test('is fully deterministic for a fixed seed', () => {
  const run = () => new PvancSession(baseConfig()).run(makePvancResponder({ trueLogMAR: 0.25 }, createRng('obs')));
  const a = run();
  const b = run();
  assert.equal(a.result!.estimate as unknown as number, b.result!.estimate as unknown as number);
  assert.equal(a.trials.length, b.trials.length);
  assert.equal(a.exportJson, b.exportJson);
});

test('structured export carries all seven facets with real session data', () => {
  const session = new PvancSession(baseConfig({ userPseudonymId: 'user-1' }));
  const r = session.run(makePvancResponder({ trueLogMAR: 0.3 }, createRng('obs')));
  const doc = r.export;

  // version metadata
  assert.equal(doc.versions.moduleId, 'acuity-pvanc');
  assert.equal(doc.versions.specVersion, 'PVANC-1.0');
  assert.equal(doc.versions.dataSchemaVersion, '1');
  assert.ok(doc.versions.exportSchemaVersion);

  // session summary + measurement result
  assert.equal(doc.session.userPseudonymId, 'user-1');
  assert.equal(doc.session.status, 'completed');
  assert.equal(doc.session.result!.scale, 'logMAR');

  // reliability/confidence
  assert.equal(doc.reliability!.quality.band, r.quality!.band);
  assert.equal(doc.reliability!.trialCounts.total, r.trials.length);
  assert.ok(doc.reliability!.trialCounts.validPhase2 >= 15);

  // device metadata (resolved profile + raw signals)
  assert.equal(doc.device.profile.deviceModel, 'iPhone16,1');
  assert.equal(doc.device.signals.deviceClass, 'smartphone');
  assert.equal(doc.device.profileSource, 'database');

  // calibration + environment + QC metadata
  assert.equal(doc.calibration.viewingDistance.method, 'cord-measured');
  assert.equal(doc.environment.ambientLux, 300);
  assert.equal(doc.qc.blocked, false);
  assert.equal(doc.qc.completeness.complete, true);

  // raw trial-level data is present in full, and the CSV matches
  assert.equal(doc.trialCount, doc.trials.length);
  assert.equal(r.trialsCsv.trim().split('\n').length, doc.trials.length + 1);
});

test('blocked sessions still export device/QC metadata with no measurement', () => {
  const r = new PvancSession(baseConfig({ deviceSignals: phoneSignals({ darkMode: 'on' }) })).run(
    makePvancResponder({ trueLogMAR: 0.2 }, createRng('o')),
  );
  assert.equal(r.export.session.status, 'blocked');
  assert.equal(r.export.session.result, null);
  assert.equal(r.export.reliability, null);
  assert.equal(r.export.qc.blocked, true);
  assert.match(r.export.qc.blockReason ?? '', /dark mode/);
  assert.equal(r.export.device.signals.darkMode, 'on'); // device metadata preserved
  assert.equal(r.export.trialCount, 0);
});

// --- Edge cases -----------------------------------------------------------

test('blocks under-18 before any measurement', () => {
  const r = new PvancSession(baseConfig({ age: 10 })).run(makePvancResponder({ trueLogMAR: 0.2 }, createRng('o')));
  assert.equal(r.status, 'blocked');
  assert.equal(r.result, null);
  assert.equal(r.permittedOutput, 'retake');
  assert.equal(r.trials.length, 0);
});

test('blocks when dark mode is active (QC pre-flight)', () => {
  const cfg = baseConfig({ deviceSignals: phoneSignals({ darkMode: 'on' }) });
  const r = new PvancSession(cfg).run(makePvancResponder({ trueLogMAR: 0.2 }, createRng('o')));
  assert.equal(r.status, 'blocked');
  assert.match(r.reason ?? '', /dark mode/);
});

test('floors to inconclusive when even the largest optotype is missed', () => {
  // A responder that never matches any orientation ⇒ all incorrect ⇒ floor.
  const alwaysWrong: Responder = () => ({ rawValue: '__none__', latencyMs: 800 });
  const r = new PvancSession(baseConfig()).run(alwaysWrong);
  assert.equal(r.status, 'inconclusive');
  assert.equal(r.result!.category, 'inconclusive');
  assert.equal(r.permittedOutput, 'retake');
  assert.ok(r.trials.length > 0); // attempts were logged
});

test('timeouts are recorded as errors and flagged; result is inconclusive', () => {
  // Correct answer but always beyond the 5 s response window.
  const slow: Responder = (stim) => ({ rawValue: stim.identity, latencyMs: 6000 });
  const r = new PvancSession(baseConfig()).run(slow);
  assert.equal(r.status, 'inconclusive');
  assert.ok(r.quality!.flags.some((f) => f.code === 'response-timeout'));
});

test('coarse display fails the adequacy gate and caps quality', () => {
  // Generic desktop (low pixel density) at a short distance cannot resolve fine detail.
  const cfg = baseConfig({
    // No deviceModel ⇒ generic per-class fallback profile (low pixel density).
    deviceSignals: {
      deviceClass: 'desktop',
      ambientLux: 300,
      darkMode: 'off',
      colourFilter: 'off',
      autoBrightness: 'off',
      batteryLevel: 0.9,
      capturedAt: NOW,
    },
    distance: { method: 'cord-measured', valueMetres: 0.4 },
  });
  const r = new PvancSession(cfg).run(makePvancResponder({ trueLogMAR: 0.3 }, createRng('o')));
  assert.equal(r.calibrationProfile.adequacy.passes, false);
  assert.equal(r.calibrationProfile.adequacy.qualityCap, 70);
  assert.ok(r.quality!.value <= 70);
  // W4: a device-limited result must not present a vision category.
  assert.equal(r.status, 'inconclusive');
  assert.equal(r.result!.category, 'inconclusive');
  assert.ok(r.quality!.flags.some((f) => f.code === 'device-limited-result'));
  assert.equal(r.permittedOutput, 'retake');
  // The raw estimate is still recorded (not hidden).
  assert.equal(typeof (r.result!.estimate as unknown as number), 'number');
  assert.ok(r.result!.limitations.some((l) => /device-limited/i.test(l)));
});

test('a genuine low-vision result on an ADEQUATE device keeps its vision category', () => {
  // Ensures W4 does not over-trigger: on a good device, below-expected stays below-expected.
  const r = new PvancSession(baseConfig()).run(makePvancResponder({ trueLogMAR: 0.8 }, createRng('lv')));
  assert.equal(r.calibrationProfile.adequacy.passes, true);
  assert.equal(r.status, 'completed');
  assert.equal(r.result!.category, 'below_expected');
});

test('user-reported distance lowers the distance-stability component vs measured', () => {
  const measured = new PvancSession(baseConfig()).run(makePvancResponder({ trueLogMAR: 0.3 }, createRng('o')));
  const reported = new PvancSession(
    baseConfig({ distance: { method: 'user-reported', valueMetres: 2 } }),
  ).run(makePvancResponder({ trueLogMAR: 0.3 }, createRng('o')));
  assert.ok(
    reported.quality!.components['distance']!.value < measured.quality!.components['distance']!.value,
  );
});
