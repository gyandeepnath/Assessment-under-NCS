import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeGaussian, weibull, normalCdf, erf, clampProb } from './psychometric.ts';

const P = { threshold: 0, slope: 1, guessRate: 0.25, lapseRate: 0.02 };

test('erf and normalCdf hit known values', () => {
  assert.ok(Math.abs(erf(0)) < 1e-9);
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
});

test('cumulativeGaussian respects asymptotes', () => {
  // far below threshold → guess rate; far above → 1 - lapse
  assert.ok(Math.abs(cumulativeGaussian(-50, P) - 0.25) < 1e-6);
  assert.ok(Math.abs(cumulativeGaussian(50, P) - 0.98) < 1e-6);
});

test('cumulativeGaussian is monotonic increasing in strength', () => {
  let prev = -1;
  for (let x = -5; x <= 5; x += 0.5) {
    const p = cumulativeGaussian(x, P);
    assert.ok(p >= prev, `not monotonic at ${x}`);
    prev = p;
  }
});

test('at threshold P equals the midpoint between asymptotes', () => {
  const mid = P.guessRate + (1 - P.guessRate - P.lapseRate) * 0.5;
  assert.ok(Math.abs(cumulativeGaussian(0, P) - mid) < 1e-6);
});

test('weibull respects asymptotes and monotonicity', () => {
  assert.ok(cumulativeGaussian(0, P) > 0 && cumulativeGaussian(0, P) < 1);
  assert.ok(weibull(-50, P) - 0.25 < 1e-6);
  assert.ok(Math.abs(weibull(50, P) - 0.98) < 1e-6);
});

test('invalid params are rejected', () => {
  assert.throws(() => cumulativeGaussian(0, { ...P, slope: 0 }), RangeError);
  assert.throws(() => cumulativeGaussian(0, { ...P, guessRate: 0.6, lapseRate: 0.6 }), RangeError);
});

test('clampProb keeps probabilities inside (0,1)', () => {
  assert.ok(clampProb(0) > 0);
  assert.ok(clampProb(1) < 1);
  assert.equal(clampProb(0.5), 0.5);
});
