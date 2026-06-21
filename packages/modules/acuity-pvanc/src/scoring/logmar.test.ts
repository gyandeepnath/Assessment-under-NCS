import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sizeLevels,
  thresholdGrid,
  snellenDenominatorFeet,
  snellenDenominatorMetres,
  decimalAcuity,
  etdrsLetters,
  assignCategory,
} from './logmar.ts';

test('size levels span +1.0 → −0.3 in 0.1 steps', () => {
  const levels = sizeLevels();
  assert.equal(levels[0], 1.0);
  assert.equal(levels[levels.length - 1], -0.3);
  assert.equal(levels.length, 14);
});

test('threshold grid covers the range', () => {
  const g = thresholdGrid(0.05);
  assert.equal(g[0], -0.3);
  assert.equal(g[g.length - 1], 1.0);
});

test('Snellen / decimal / ETDRS conversions (PVANC §9.2)', () => {
  assert.equal(snellenDenominatorFeet(0), 20); // 20/20
  assert.equal(snellenDenominatorFeet(1), 200); // 20/200
  assert.equal(snellenDenominatorFeet(0.3), 40); // ~20/40
  assert.equal(snellenDenominatorMetres(0), 6); // 6/6
  assert.equal(decimalAcuity(0), 1);
  assert.equal(decimalAcuity(1), 0.1);
  assert.equal(etdrsLetters(0), 85);
  assert.equal(etdrsLetters(1), 35);
  assert.equal(etdrsLetters(-0.3), 100);
});

test('category cut-offs (PVANC §9.4)', () => {
  assert.equal(assignCategory(0.2), 'within_expected');
  assert.equal(assignCategory(0.3), 'within_expected');
  assert.equal(assignCategory(0.4), 'borderline');
  assert.equal(assignCategory(0.6), 'below_expected');
});

test('age norm relaxes (never tightens) the within-expected boundary', () => {
  // Older adult: expected mean ~0.26 → within-expected boundary widens to ~0.46.
  assert.equal(assignCategory(0.4, 0.26), 'within_expected');
  // Young adult norm (~0.0) never tightens below the universal 0.30.
  assert.equal(assignCategory(0.35, 0.0), 'borderline');
});
