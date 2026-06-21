import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveResult, PVANC_LIMITATIONS } from './result.ts';
import { asScale } from './logmar.ts';
import type { ResultInput } from '@vision-platform/core-contracts';

function input(estimate: number, sd?: number): ResultInput {
  return {
    terminalEstimate: asScale(estimate),
    ...(sd !== undefined ? { posteriorSummary: { thresholdSd: sd } } : {}),
    trials: [],
  };
}

test('produces estimate, 68% and 95% credible intervals from posterior SD', () => {
  const r = deriveResult(input(0.3, 0.1));
  assert.equal(r.scale, 'logMAR');
  assert.equal(r.estimate as unknown as number, 0.3);
  assert.deepEqual(
    [r.credibleInterval68!.min as unknown as number, r.credibleInterval68!.max as unknown as number],
    [0.2, 0.4],
  );
  // 95% ≈ ±1.96·SD
  assert.ok(Math.abs((r.credibleInterval95!.min as unknown as number) - 0.1) < 1e-9);
  assert.ok(Math.abs((r.credibleInterval95!.max as unknown as number) - 0.5) < 1e-9);
});

test('every result carries the mandatory limitations (no unsupported claims)', () => {
  const r = deriveResult(input(0.1, 0.08));
  assert.equal(r.limitations.length, PVANC_LIMITATIONS.length);
  assert.ok(r.limitations.some((l) => /not best-corrected/i.test(l)));
  assert.ok(r.limitations.some((l) => /does not diagnose/i.test(l)));
});

test('assigns a category by default', () => {
  assert.equal(deriveResult(input(0.2, 0.08)).category, 'within_expected');
  assert.equal(deriveResult(input(0.55, 0.08)).category, 'below_expected');
});

test('inconclusive option suppresses the category', () => {
  const r = deriveResult(input(0.3, 0.08), { inconclusive: true });
  assert.equal(r.category, 'inconclusive');
});

test('omits credible intervals when no posterior SD is available', () => {
  const r = deriveResult(input(0.3));
  assert.equal(r.credibleInterval68, undefined);
  assert.equal(r.credibleInterval95, undefined);
});
