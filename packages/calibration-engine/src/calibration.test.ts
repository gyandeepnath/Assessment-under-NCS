import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDeviceProfile,
  acquireDistance,
  distanceConfidence,
  degToPx,
  pxToDeg,
  pixelsPerDegree,
  adequacy,
  captureEnvironment,
} from './index.ts';
import type { DeviceSignals, Degrees, Pixels } from '@vision-platform/core-contracts';

const now = '2026-06-21T00:00:00.000Z';

test('device profiling: exact database match is high confidence', () => {
  const p = resolveDeviceProfile({ deviceModel: 'iPhone16,1', deviceClass: 'smartphone', capturedAt: now });
  assert.equal(p.isFallback, false);
  assert.equal(p.source, 'database');
  assert.ok(Math.abs(p.pixelPitch - 0.05522) < 1e-4);
});

test('device profiling: derives pitch from reported PPI', () => {
  const p = resolveDeviceProfile({ deviceClass: 'tablet', reportedPpi: 254, capturedAt: now });
  assert.equal(p.source, 'reported-ppi');
  assert.ok(Math.abs(p.pixelPitch - 25.4 / 254) < 1e-6);
});

test('device profiling: derives pitch from resolution + diagonal', () => {
  const p = resolveDeviceProfile({
    deviceClass: 'desktop',
    screenWidthPx: 1920,
    screenHeightPx: 1080,
    reportedDiagonalInches: 24,
    capturedAt: now,
  });
  assert.equal(p.source, 'resolution+size');
  // ~91.8 ppi → ~0.2767 mm/px
  assert.ok(p.pixelPitch > 0.27 && p.pixelPitch < 0.29);
});

test('device profiling: per-class fallback when no metadata (not a single hard-coded class)', () => {
  for (const cls of ['smartphone', 'tablet', 'desktop', 'other'] as const) {
    const p = resolveDeviceProfile({ deviceClass: cls, capturedAt: now });
    assert.equal(p.isFallback, true);
    assert.equal(p.source, 'class-fallback');
    assert.ok(p.pixelPitch > 0);
  }
});

test('distance: uncertainty depends on method and grades confidence', () => {
  const cord = acquireDistance('cord-measured', 2);
  const user = acquireDistance('user-reported', 2);
  assert.ok(cord.uncertainty < user.uncertainty);
  assert.equal(distanceConfidence(cord), 'high');
  assert.equal(distanceConfidence(user), 'low');
});

test('distance: rejects non-positive values for measured methods', () => {
  assert.throws(() => acquireDistance('cord-measured', 0), RangeError);
  assert.throws(() => acquireDistance('user-reported', -1), RangeError);
});

test('geometry: degToPx matches the small-angle expectation and round-trips', () => {
  const device = resolveDeviceProfile({ deviceModel: 'iPhone16,1', deviceClass: 'smartphone', capturedAt: now });
  const distance = acquireDistance('cord-measured', 2);
  // 1 arcmin at 2m = 2000 * tan(1/60 deg) ≈ 0.5818 mm → /0.05522 ≈ 10.5 px
  const px = degToPx((1 / 60) as Degrees, device, distance);
  assert.ok(px > 10 && px < 11, `unexpected px: ${px}`);
  // round trip
  const deg = pxToDeg(px, device, distance);
  assert.ok(Math.abs(deg - 1 / 60) < 1e-6);
});

test('geometry: pixels-per-degree scales with distance', () => {
  const device = resolveDeviceProfile({ deviceModel: 'iPhone16,1', deviceClass: 'smartphone', capturedAt: now });
  const near = pixelsPerDegree(device, acquireDistance('cord-measured', 1));
  const far = pixelsPerDegree(device, acquireDistance('cord-measured', 2));
  assert.ok(far > near * 1.9 && far < near * 2.1); // ~doubles
});

test('adequacy: passes on a dense phone, caps quality on a coarse display', () => {
  const distance = acquireDistance('cord-measured', 2);
  const phone = resolveDeviceProfile({ deviceModel: 'iPhone16,1', deviceClass: 'smartphone', capturedAt: now });
  const laptop = resolveDeviceProfile({ deviceClass: 'desktop', capturedAt: now });

  // Require 0.5 arcmin detail (20/10-grade stroke). Dense phone resolves it; the
  // coarse laptop cannot render that fine at 2m, so it is capped.
  const phoneReport = adequacy({ device: phone, distance, requiredDetailArcmin: 0.5 });
  const laptopReport = adequacy({ device: laptop, distance, requiredDetailArcmin: 0.5 });
  assert.equal(phoneReport.passes, true);
  assert.equal(phoneReport.qualityCap, undefined);
  assert.equal(laptopReport.passes, false);
  assert.equal(laptopReport.qualityCap, 70);
});

test('environment: captures ambient light only when available', () => {
  const withLux = captureEnvironment({ deviceClass: 'smartphone', ambientLux: 300, capturedAt: now });
  assert.equal(withLux.ambientAvailable, true);
  assert.equal(withLux.ambientLux, 300);

  const withoutLux = captureEnvironment({ deviceClass: 'smartphone', capturedAt: now });
  assert.equal(withoutLux.ambientAvailable, false);
  assert.equal(withoutLux.ambientLux, null);
  assert.equal(withoutLux.darkMode, 'unknown');
});
