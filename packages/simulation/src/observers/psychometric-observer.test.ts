import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PsychometricObserver } from './psychometric-observer.ts';
import { QuestPlus, createRng } from '@vision-platform/core-engine';

test('pCorrect honours asymptotes', () => {
  const obs = new PsychometricObserver({ threshold: 0, slope: 1, guessRate: 0.25, lapseRate: 0.02 });
  assert.ok(Math.abs(obs.pCorrect(-50) - 0.25) < 1e-6);
  assert.ok(Math.abs(obs.pCorrect(50) - 0.98) < 1e-6);
});

test('respond is deterministic for a fixed seed', () => {
  const obs = new PsychometricObserver({ threshold: 0, slope: 1, guessRate: 0.25, lapseRate: 0.02 });
  const a = Array.from({ length: 20 }, (_, i) => obs.respond(i * 0.1, createRng('seed')));
  const b = Array.from({ length: 20 }, (_, i) => obs.respond(i * 0.1, createRng('seed')));
  assert.deepEqual(a, b);
});

test('end-to-end: QUEST+ recovers the observer ground truth (cross-package)', () => {
  // Averaged over seeds so the assertion is stable for a stochastic procedure.
  const truth = { threshold: 0.5, slope: 1.0, guessRate: 0.25, lapseRate: 0.02 };
  const obs = new PsychometricObserver(truth);
  const dom: number[] = [];
  for (let x = -4; x <= 4.0001; x += 0.25) dom.push(Number(x.toFixed(4)));
  const grid: number[] = [];
  for (let x = -3; x <= 3.0001; x += 0.1) grid.push(Number(x.toFixed(4)));

  const estimates: number[] = [];
  for (let seed = 0; seed < 40; seed++) {
    const rng = createRng(`e2e-${seed}`);
    const q = new QuestPlus({
      stimulusDomain: dom,
      thresholdGrid: grid,
      slopeGrid: [1.0],
      guessRate: 0.25,
      lapseRate: 0.02,
      maxTrials: 60,
    });
    for (let i = 0; i < 60; i++) {
      const x = q.nextStimulus();
      q.update(x, obs.respond(x, rng));
    }
    estimates.push(q.estimate().threshold);
  }
  // The stable, meaningful property: across seeds the recovered threshold centres
  // on the observer's ground truth (unbiasedness of the wired-up procedure).
  const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  assert.ok(Math.abs(mean - 0.5) < 0.1, `recovered mean off ground truth: ${mean.toFixed(3)}`);
});
