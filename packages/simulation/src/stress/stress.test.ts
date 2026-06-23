/**
 * Stress tests for the PVANC module (dev/test only).
 *
 * Each test drives a real PvancSession under an abnormal condition and asserts
 * how the system reacts: whether QC catches it, and whether the output is
 * ACCEPTED, FLAGGED, or SUPPRESSED (sent to retake / inconclusive). Conditions the
 * synchronous module does not model (mid-session rotation/resize, true
 * interruption, export-path data loss) are exercised to DOCUMENT the gap, not to
 * pretend it is handled — see docs/validation/PVANC-STRESS-REPORT.md.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeResponder, PHONE_SIGNALS } from '../observers/pvanc-observers.ts';
import { PvancSession, type PvancSessionConfig, type PvancSessionResult } from '@vision-platform/module-acuity-pvanc';
import { createRng } from '@vision-platform/core-engine';
import { resolveDeviceProfile } from '@vision-platform/calibration-engine';
import { buildSessionExport, exportToJson } from '@vision-platform/data-layer';
import type { StimulusSpec, DeviceSignals } from '@vision-platform/core-contracts';

function run(label: string, override: Partial<PvancSessionConfig>, responder: (s: StimulusSpec) => { rawValue: string; latencyMs: number }): PvancSessionResult {
  const cfg: PvancSessionConfig = {
    sessionId: label,
    seed: `${label}:s`,
    deviceSignals: PHONE_SIGNALS,
    distance: { method: 'cord-measured', valueMetres: 2 },
    age: 30,
    ...override,
  };
  return new PvancSession(cfg).run(responder);
}

const flagCodes = (r: PvancSessionResult) => (r.quality ? r.quality.flags.map((f) => f.code) : []);
const compliant = (seed: string) => makeResponder({ trueThreshold: 0.3, slope: 2, guessRate: 0.25, baseLapse: 0.02 }, createRng(seed));

// 1. Extreme brightness variation -------------------------------------------
test('extreme brightness variation → FLAGGED + SUPPRESSED', () => {
  const r = run(
    'brightness',
    { deviceSignals: { ...PHONE_SIGNALS, autoBrightness: 'on', ambientLux: 5000 } },
    makeResponder({ trueThreshold: 0.3, slope: 2, guessRate: 0.25, baseLapse: 0.02, effectiveSize: (n) => n - 0.2 }, createRng('b')),
  );
  assert.ok(flagCodes(r).includes('auto-brightness'));
  assert.ok(flagCodes(r).includes('illuminance-out-of-range'));
  assert.equal(r.permittedOutput, 'retake'); // environment component → 0, quality low
});

// 2. Wrong viewing distance --------------------------------------------------
test('wrong viewing distance (corroborated) → FLAGGED + SUPPRESSED', () => {
  const r = run(
    'distance',
    { distance: { method: 'cord-measured', valueMetres: 2, corroboration: { method: 'camera-estimated', valueMetres: 1.0 } } },
    makeResponder({ trueThreshold: 0.3, slope: 2, guessRate: 0.25, baseLapse: 0.02, effectiveSize: (n) => n + Math.log10(2 / 1.0) }, createRng('d')),
  );
  assert.ok(flagCodes(r).includes('distance-corroboration-disagreement'));
  assert.equal(r.quality!.components['distance']!.value, 0);
  assert.equal(r.permittedOutput, 'retake');
});

// 3. Slow response times -----------------------------------------------------
test('slow responses beyond the window → FLAGGED + SUPPRESSED', () => {
  const r = run('slow', {}, (s) => ({ rawValue: s.identity, latencyMs: 6000 })); // every response times out
  assert.ok(flagCodes(r).includes('response-timeout'));
  assert.equal(r.status, 'inconclusive');
  assert.equal(r.permittedOutput, 'retake');
});

test('slow-but-within-window responses are ACCEPTED', () => {
  const inner = compliant('sv');
  const r = run('slow-valid', {}, (s) => ({ rawValue: inner(s).rawValue, latencyMs: 4000 }));
  assert.equal(r.status, 'completed'); // 4 s < 5 s window → usable
});

// 4. Repeated same-answer pattern -------------------------------------------
test('repeated same-answer pattern → SUPPRESSED (at chance → floor/inconclusive)', () => {
  const r = run('repeat', {}, () => ({ rawValue: 'up', latencyMs: 800 }));
  assert.equal(r.status, 'inconclusive');
  assert.equal(r.permittedOutput, 'retake');
  assert.notEqual(r.result!.category, 'within_expected'); // never a confident normal result
});

// 5. Random tapping ----------------------------------------------------------
test('random tapping → SUPPRESSED', () => {
  const r = run('random', {}, makeResponder({ trueThreshold: 0, slope: 2, guessRate: 0.25, baseLapse: 0.02, pureChance: true }, createRng('rt')));
  assert.equal(r.status, 'inconclusive');
  assert.equal(r.permittedOutput, 'retake');
});

// 6. Interrupted session -----------------------------------------------------
test('interrupted session (responder throws) → NOT handled gracefully (GAP)', () => {
  let n = 0;
  const inner = compliant('int');
  // The synchronous session has no checkpoint/resume; an exception mid-session
  // propagates and no partial result is produced. Documents the gap.
  assert.throws(
    () =>
      run('interrupt', {}, (s) => {
        if (++n > 8) throw new Error('app backgrounded / process killed');
        return inner(s);
      }),
    /app backgrounded/,
  );
});

// 7. Device rotation ---------------------------------------------------------
test('device rotation is recorded but not enforced mid-session (GAP)', () => {
  const r = run('rotate', { deviceSignals: { ...PHONE_SIGNALS, orientation: 'landscape' } }, compliant('rot'));
  // Orientation is captured in the export...
  assert.equal(r.export.environment.orientation, 'landscape');
  // ...but there is no orientation-lock / discard-on-rotation flag at the module
  // level (that QC lives in the deferred host/orchestrator, PVANC §11.1).
  assert.ok(!flagCodes(r).some((c) => /rotat|orient/.test(c)));
  assert.equal(r.status, 'completed'); // accepted
});

// 8. Screen resize -----------------------------------------------------------
test('screen resize would change geometry but the profile is captured once (GAP)', () => {
  // Different reported resolutions resolve to different pixel pitches, so a
  // mid-session resize would invalidate the fixed profile — which the session
  // captures only at start and never re-resolves.
  const small = resolveDeviceProfile({ deviceClass: 'desktop', screenWidthPx: 1280, screenHeightPx: 720, reportedDiagonalInches: 24, capturedAt: PHONE_SIGNALS.capturedAt });
  const large = resolveDeviceProfile({ deviceClass: 'desktop', screenWidthPx: 3840, screenHeightPx: 2160, reportedDiagonalInches: 24, capturedAt: PHONE_SIGNALS.capturedAt });
  assert.notEqual(small.pixelPitch, large.pixelPitch); // geometry depends on resolution
  const r = run('resize', {}, compliant('rz'));
  assert.equal(r.export.device.profile.deviceModel, 'iPhone16,1'); // single, start-of-session profile
});

// 9. Calibration failure -----------------------------------------------------
test('calibration failure — unknown distance → SUPPRESSED', () => {
  const r = run('calib-dist', { distance: { method: 'unknown', valueMetres: 2 } }, compliant('cd'));
  assert.equal(r.quality!.components['distance']!.value, 0); // unknown distance → no confidence
  assert.equal(r.permittedOutput, 'retake');
});

test('calibration failure — fallback device profile is ACCEPTED with caveat (GAP)', () => {
  // No device model ⇒ generic per-class fallback (less accurate), but if adequacy
  // still passes the quality score does not penalise the fallback itself.
  const r = run('calib-dev', { deviceSignals: { deviceClass: 'smartphone', capturedAt: PHONE_SIGNALS.capturedAt } }, compliant('cv'));
  assert.equal(r.calibrationProfile.deviceProfile.isFallback, true);
  assert.equal(r.calibrationProfile.confidence, 'low'); // profile confidence IS low...
  // ...yet the result is still accepted with caveat (fallback not reflected in the score).
  assert.notEqual(r.permittedOutput, 'retake');
});

// 10. Partial data loss ------------------------------------------------------
test('partial data loss below the completeness threshold → SUPPRESSED', () => {
  // Simulate lost trials by capping Phase 2 at 5 (< the 15-valid minimum).
  const r = run('loss-low', { maxPhase2Trials: 5 }, compliant('ll'));
  assert.equal(r.status, 'inconclusive');
  assert.equal(r.permittedOutput, 'retake');
});

test('partial data loss in the export path is UNDETECTED (no integrity check) (GAP)', () => {
  const r = run('loss-export', {}, compliant('le'));
  assert.equal(r.status, 'completed');
  const full = r.export.trials.length;
  // Drop half the trials and rebuild the export: it succeeds, and trialCount just
  // shrinks — there is no expected-vs-actual trial-count integrity check.
  const { exportSchemaVersion: _omit, ...versions } = r.export.versions;
  const dropped = buildSessionExport({
    generatedAt: r.export.generatedAt,
    versions,
    session: r.export.session,
    reliability: r.export.reliability,
    device: r.export.device,
    calibration: r.export.calibration,
    environment: r.export.environment,
    qc: r.export.qc,
    trials: r.export.trials.slice(0, Math.floor(full / 2)),
  });
  assert.equal(dropped.trialCount, Math.floor(full / 2));
  assert.ok(dropped.trialCount < full);
  assert.doesNotThrow(() => exportToJson(dropped)); // silent: no loss detected
});
