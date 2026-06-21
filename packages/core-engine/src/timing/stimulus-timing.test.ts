import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ManualClock } from '../clock/clock.ts';
import { StimulusTimer } from './stimulus-timing.ts';
import type { Millis } from '@vision-platform/core-contracts';

const cfg = { interStimulusMs: 500, responseWindowMs: 5000, anticipationMs: 200 };

test('markOnset reads the clock', () => {
  const clock = new ManualClock(1000);
  const timer = new StimulusTimer(clock, cfg);
  assert.equal(timer.markOnset(), 1000);
});

test('classifies a normal response as valid', () => {
  const timer = new StimulusTimer(new ManualClock(), cfg);
  const t = timer.classify(0 as Millis, 800 as Millis);
  assert.equal(t.classification, 'valid');
  assert.equal(t.latencyMs, 800);
});

test('flags anticipatory responses (<200ms)', () => {
  const timer = new StimulusTimer(new ManualClock(), cfg);
  assert.equal(timer.classify(0 as Millis, 150 as Millis).classification, 'anticipatory');
});

test('flags slow responses beyond the window as timeout', () => {
  const timer = new StimulusTimer(new ManualClock(), cfg);
  assert.equal(timer.classify(0 as Millis, 6000 as Millis).classification, 'timeout');
});

test('null response is a timeout with no latency', () => {
  const timer = new StimulusTimer(new ManualClock(), cfg);
  const t = timer.classify(0 as Millis, null);
  assert.equal(t.classification, 'timeout');
  assert.equal(t.latencyMs, null);
});

test('enforces inter-stimulus interval', () => {
  const timer = new StimulusTimer(new ManualClock(), cfg);
  assert.equal(timer.earliestNextOnset(1000 as Millis), 1500);
});

test('rejects a response that precedes onset', () => {
  const timer = new StimulusTimer(new ManualClock(), cfg);
  assert.throws(() => timer.classify(500 as Millis, 200 as Millis), RangeError);
});

test('rejects invalid configuration', () => {
  assert.throws(() => new StimulusTimer(new ManualClock(), { interStimulusMs: -1, responseWindowMs: 100 }), RangeError);
  assert.throws(() => new StimulusTimer(new ManualClock(), { interStimulusMs: 0, responseWindowMs: 0 }), RangeError);
});
