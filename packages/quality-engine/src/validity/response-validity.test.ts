import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessResponseValidity, type ValidityTrial } from './response-validity.ts';

const CHANCE = 0.25;

/** Build trials at a fixed intensity with a given correctness pattern. */
function trials(spec: Array<{ intensity: number; correct: boolean; count: number; latencyMs?: number }>): ValidityTrial[] {
  const out: ValidityTrial[] = [];
  for (const s of spec) {
    for (let i = 0; i < s.count; i++) {
      out.push({ intensity: s.intensity, correct: s.correct, usable: true, latencyMs: s.latencyMs ?? 800 });
    }
  }
  return out;
}

test('flat at-chance performance (overall AND on the largest optotypes) is invalid', () => {
  // 24 trials piled near the top, ~25% correct everywhere — the guesser signature.
  const t = trials([
    { intensity: 1.0, correct: true, count: 3 },
    { intensity: 1.0, correct: false, count: 9 },
    { intensity: 0.9, correct: true, count: 3 },
    { intensity: 0.9, correct: false, count: 9 },
  ]);
  const v = assessResponseValidity(t, { chanceRate: CHANCE });
  assert.equal(v.valid, false);
  assert.ok(v.flags.some((f) => f.code === 'invalid-response-pattern'));
});

test('genuine low vision (low overall, but the largest optotypes seen well) is VALID', () => {
  // Monotonic: ~83% on the largest band, poor near threshold ⇒ low overall but NOT at chance on easy items.
  const t = trials([
    { intensity: 1.0, correct: true, count: 5 },
    { intensity: 1.0, correct: false, count: 1 }, // easy band ≈ 83%
    { intensity: 0.4, correct: true, count: 2 },
    { intensity: 0.4, correct: false, count: 12 }, // overall ≈ 0.35
  ]);
  const v = assessResponseValidity(t, { chanceRate: CHANCE });
  assert.ok(v.overallAccuracy! < 0.4, 'overall should be low');
  assert.equal(v.valid, true, 'must not flag genuine low vision');
});

test('high performer is valid', () => {
  const t = trials([
    { intensity: 1.0, correct: true, count: 8 },
    { intensity: 0.2, correct: true, count: 10 },
    { intensity: 0.2, correct: false, count: 4 },
  ]);
  assert.equal(assessResponseValidity(t, { chanceRate: CHANCE }).valid, true);
});

test('insufficient usable trials → not judged (valid)', () => {
  const t = trials([
    { intensity: 1.0, correct: false, count: 4 },
    { intensity: 0.9, correct: false, count: 4 },
  ]); // 8 usable < minUsable (12)
  assert.equal(assessResponseValidity(t, { chanceRate: CHANCE }).valid, true);
});

test('runs of anticipatory responses raise a rapid-guessing flag', () => {
  const t = trials([
    { intensity: 1.0, correct: true, count: 6, latencyMs: 120 }, // 6 consecutive <200ms
    { intensity: 0.5, correct: true, count: 10, latencyMs: 800 },
  ]);
  const v = assessResponseValidity(t, { chanceRate: CHANCE });
  assert.ok(v.consecutiveRapidMax >= 3);
  assert.ok(v.flags.some((f) => f.code === 'rapid-guessing'));
});

test('unusable trials are excluded from accuracy', () => {
  const t: ValidityTrial[] = [
    ...trials([{ intensity: 1.0, correct: true, count: 8 }]),
    { intensity: 1.0, correct: false, usable: false, latencyMs: 6000 }, // timeout, excluded
  ];
  const v = assessResponseValidity(t, { chanceRate: CHANCE });
  assert.equal(v.overallAccuracy, 1); // only usable counted
});
