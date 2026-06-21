import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometryForLogMar, strokeArcmin, buildTumblingE, ORIENTATIONS } from './tumbling-e.ts';
import { createRng } from '@vision-platform/core-engine';
import { asScale } from '../scoring/logmar.ts';

test('geometry derives from MAR: stroke = MAR, height = 5×stroke (PVANC §6.4/§7)', () => {
  const g = geometryForLogMar(0); // MAR = 1 arcmin
  assert.ok(Math.abs(g.strokeDeg - 1 / 60) < 1e-9);
  assert.ok(Math.abs(g.heightDeg - 5 / 60) < 1e-9);
  assert.ok(Math.abs(g.gapDeg - g.strokeDeg) < 1e-12);
});

test('crowding bars: thickness = stroke, spacing = 2×stroke, length = 2×height', () => {
  const g = geometryForLogMar(0.3);
  assert.ok(Math.abs(g.crowdingThicknessDeg - g.strokeDeg) < 1e-12);
  assert.ok(Math.abs(g.crowdingSpacingDeg - 2 * g.strokeDeg) < 1e-12);
  assert.ok(Math.abs(g.crowdingLengthDeg - 2 * g.heightDeg) < 1e-12);
});

test('larger logMAR ⇒ larger optotype (easier)', () => {
  assert.ok(geometryForLogMar(1.0).heightDeg > geometryForLogMar(0.0).heightDeg);
});

test('strokeArcmin = 10^logMAR', () => {
  assert.ok(Math.abs(strokeArcmin(0) - 1) < 1e-9);
  assert.ok(Math.abs(strokeArcmin(1) - 10) < 1e-9);
});

test('buildTumblingE: 4AFC, crowded, identity is a valid orientation', () => {
  const s = buildTumblingE({ intensity: asScale(0.2), trialNumber: 1, phase: 'phase2_bayesian' }, createRng('s'));
  assert.equal(s.kind, 'tumbling_e');
  assert.equal(s.responseModel.alternatives, 4);
  assert.equal(s.responseModel.chanceRate, 0.25);
  assert.ok(s.flankers, 'should be crowded');
  assert.ok((ORIENTATIONS as readonly string[]).includes(s.identity));
  assert.equal(s.intensity as unknown as number, 0.2);
});

test('orientation selection is deterministic for a fixed seed', () => {
  const a = buildTumblingE({ intensity: asScale(0.2), trialNumber: 1, phase: 'p' }, createRng('seed'));
  const b = buildTumblingE({ intensity: asScale(0.2), trialNumber: 1, phase: 'p' }, createRng('seed'));
  assert.equal(a.identity, b.identity);
});
