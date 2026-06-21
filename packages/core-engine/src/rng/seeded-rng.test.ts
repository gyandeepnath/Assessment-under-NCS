import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mulberry32, createRng, hashSeed } from './seeded-rng.ts';

test('same seed reproduces the same sequence', () => {
  const a = new Mulberry32('PVANC-seed');
  const b = new Mulberry32('PVANC-seed');
  const seqA = Array.from({ length: 10 }, () => a.next());
  const seqB = Array.from({ length: 10 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds diverge', () => {
  const a = new Mulberry32('seed-a');
  const b = new Mulberry32('seed-b');
  assert.notEqual(a.next(), b.next());
});

test('next() stays within [0, 1)', () => {
  const r = createRng(42);
  for (let i = 0; i < 1000; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
  }
});

test('int() is within [0, max) and roughly uniform', () => {
  const r = createRng('uniformity');
  const counts = new Array(4).fill(0) as number[];
  const n = 40000;
  for (let i = 0; i < n; i++) {
    const k = r.int(4);
    assert.ok(k >= 0 && k < 4);
    counts[k]!++;
  }
  // each bucket within 5% of expected 25%
  for (const c of counts) assert.ok(Math.abs(c / n - 0.25) < 0.05, `bucket skew: ${c / n}`);
});

test('int() rejects invalid bounds', () => {
  const r = createRng(1);
  assert.throws(() => r.int(0), RangeError);
  assert.throws(() => r.int(-3), RangeError);
  assert.throws(() => r.int(2.5), RangeError);
});

test('shuffle is a permutation and does not mutate input', () => {
  const r = createRng('shuffle');
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const frozen = Object.freeze(input.slice());
  const out = r.shuffle(input);
  assert.deepEqual(input, frozen); // unchanged
  assert.deepEqual([...out].sort((x, y) => x - y), [...input].sort((x, y) => x - y));
});

test('pick rejects empty list', () => {
  const r = createRng(1);
  assert.throws(() => r.pick([]), RangeError);
});

test('hashSeed is stable and unsigned', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.ok(hashSeed('abc') >= 0);
});
