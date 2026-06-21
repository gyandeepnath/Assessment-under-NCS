import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuestPlus } from './questplus.ts';
import { cumulativeGaussian } from '../psychometric/psychometric.ts';
import { createRng } from '../../rng/seeded-rng.ts';

const GUESS = 0.25;
const LAPSE = 0.02;

function range(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let x = lo; x <= hi + 1e-9; x += step) out.push(Number(x.toFixed(4)));
  return out;
}

function newProcedure(slopeGrid: number[], maxTrials = 60) {
  return new QuestPlus({
    stimulusDomain: range(-4, 4, 0.25),
    thresholdGrid: range(-3, 3, 0.1),
    slopeGrid,
    guessRate: GUESS,
    lapseRate: LAPSE,
    maxTrials,
  });
}

test('recovers a known threshold from a simulated observer (unbiased, converging)', () => {
  // The scientifically important property is UNBIASEDNESS; spread is set by trial
  // count and the 4AFC guess rate. Asserted over many seeds so the test is stable.
  const trueThreshold = 0.8;
  const trueParams = { threshold: trueThreshold, slope: 1.0, guessRate: GUESS, lapseRate: LAPSE };
  const errors: number[] = [];

  for (let seed = 0; seed < 60; seed++) {
    const rng = createRng(`recovery-${seed}`);
    const q = newProcedure([1.0], 60); // slope fixed at the true value
    for (let i = 0; i < 60; i++) {
      const x = q.nextStimulus();
      q.update(x, rng.next() < cumulativeGaussian(x, trueParams));
    }
    errors.push(q.estimate().threshold - trueThreshold);
  }

  const meanBias = errors.reduce((a, b) => a + b, 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / errors.length);
  assert.ok(Math.abs(meanBias) < 0.08, `mean bias too large: ${meanBias.toFixed(3)}`);
  assert.ok(rmse < 0.3, `rmse too large: ${rmse.toFixed(3)}`);
});

test('posterior SD shrinks as evidence accumulates', () => {
  const trueParams = { threshold: -0.5, slope: 1.0, guessRate: GUESS, lapseRate: LAPSE };
  const rng = createRng('shrink');
  const q = newProcedure([1.0]);
  const sdStart = q.estimate().thresholdSd;
  for (let i = 0; i < 40; i++) {
    const x = q.nextStimulus();
    q.update(x, rng.next() < cumulativeGaussian(x, trueParams));
  }
  const sdEnd = q.estimate().thresholdSd;
  assert.ok(sdEnd < sdStart, `SD did not shrink: ${sdStart} -> ${sdEnd}`);
  assert.ok(sdEnd < 0.3, `final SD too wide: ${sdEnd}`);
});

test('jointly estimating slope still recovers threshold', () => {
  const trueParams = { threshold: 1.2, slope: 1.5, guessRate: GUESS, lapseRate: LAPSE };
  const rng = createRng('joint');
  const q = newProcedure([0.5, 1.0, 1.5, 2.0, 3.0]);
  for (let i = 0; i < 40; i++) {
    const x = q.nextStimulus();
    q.update(x, rng.next() < cumulativeGaussian(x, trueParams));
  }
  const est = q.estimate();
  assert.ok(Math.abs(est.threshold - 1.2) < 0.35, `threshold off: ${est.threshold.toFixed(2)}`);
});

test('stopping rule fires on posterior width', () => {
  const q = new QuestPlus({
    stimulusDomain: range(-4, 4, 0.25),
    thresholdGrid: range(-3, 3, 0.1),
    slopeGrid: [1.0],
    guessRate: GUESS,
    lapseRate: LAPSE,
    stopSd: 0.25,
    maxTrials: 200,
  });
  const trueParams = { threshold: 0, slope: 1, guessRate: GUESS, lapseRate: LAPSE };
  const rng = createRng('stop');
  let guard = 0;
  while (!q.isDone() && guard++ < 200) {
    const x = q.nextStimulus();
    q.update(x, rng.next() < cumulativeGaussian(x, trueParams));
  }
  assert.ok(q.estimate().thresholdSd < 0.25 || q.trialCount === 200);
});

test('rejects updates outside the stimulus domain and bad config', () => {
  const q = newProcedure([1.0]);
  assert.throws(() => q.update(99, true), RangeError);
  assert.throws(
    () => new QuestPlus({ stimulusDomain: [], thresholdGrid: [0], slopeGrid: [1], guessRate: GUESS, lapseRate: LAPSE }),
    RangeError,
  );
});
