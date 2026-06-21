import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Staircase } from './staircase.ts';

const base = {
  startStrength: 10,
  nDown: 3,
  nUp: 1,
  stepSize: 2,
  minStrength: 0,
  maxStrength: 20,
};

test('starts at the configured strength', () => {
  const s = new Staircase(base);
  assert.equal(s.nextStrength, 10);
});

test('3-down rule steps down only after 3 consecutive correct', () => {
  const s = new Staircase(base);
  s.update(true);
  assert.equal(s.nextStrength, 10);
  s.update(true);
  assert.equal(s.nextStrength, 10);
  s.update(true); // third correct → harder
  assert.equal(s.nextStrength, 8);
});

test('1-up rule steps up on a single incorrect', () => {
  const s = new Staircase(base);
  s.update(false);
  assert.equal(s.nextStrength, 12);
});

test('counts reversals when direction changes', () => {
  const s = new Staircase(base);
  s.update(true);
  s.update(true);
  s.update(true); // step down (dir = -1), no reversal yet
  assert.equal(s.reversalCount, 0);
  s.update(false); // step up (dir = +1) → reversal
  assert.equal(s.reversalCount, 1);
});

test('clamps to bounds', () => {
  const s = new Staircase({ ...base, startStrength: 1, stepSize: 5 });
  s.update(false); // up: 1 -> 6
  s.update(false); // 6 -> 11
  s.update(false); // 11 -> 16
  s.update(false); // 16 -> 20 (clamped, not 21)
  s.update(false); // stays at 20
  assert.ok(s.nextStrength <= 20);
});

test('threshold averages the last reversals', () => {
  const s = new Staircase({ ...base, reversalsForThreshold: 2 });
  // drive an alternating pattern to generate reversals
  for (let i = 0; i < 30; i++) s.update(i % 4 !== 3);
  assert.ok(s.reversalCount >= 2);
  const t = s.threshold();
  assert.ok(t >= 0 && t <= 20);
});

test('stops after maxReversals', () => {
  const s = new Staircase({ ...base, maxReversals: 2 });
  // 3 correct → step down (dir -1, no reversal); 1 wrong → step up (reversal #1);
  // 3 correct → step down (reversal #2) → done.
  const seq = [true, true, true, false, true, true, true];
  for (const correct of seq) {
    if (s.isDone()) break;
    s.update(correct);
  }
  assert.equal(s.reversalCount, 2);
  assert.equal(s.isDone(), true);
});

test('rejects invalid configuration', () => {
  assert.throws(() => new Staircase({ ...base, nDown: 0 }), RangeError);
  assert.throws(() => new Staircase({ ...base, minStrength: 20, maxStrength: 10 }), RangeError);
});
