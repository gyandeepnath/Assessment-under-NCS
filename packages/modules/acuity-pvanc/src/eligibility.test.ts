import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEligibility } from './eligibility.ts';

test('blocks under-18 (PVANC §5.2)', () => {
  const r = checkEligibility({ deviceClass: 'smartphone', selfReportedAge: 10 });
  assert.equal(r.decision, 'block');
});

test('blocks unsupported device class', () => {
  const r = checkEligibility({ deviceClass: 'other' });
  assert.equal(r.decision, 'block');
});

test('flags 18–21 as plausible-but-unvalidated', () => {
  const r = checkEligibility({ deviceClass: 'smartphone', selfReportedAge: 20 });
  assert.equal(r.decision, 'proceed-with-flags');
});

test('allows a typical validated adult', () => {
  const r = checkEligibility({ deviceClass: 'tablet', selfReportedAge: 35 });
  assert.equal(r.decision, 'allow');
});

test('allows when age is unknown but device is supported', () => {
  const r = checkEligibility({ deviceClass: 'desktop' });
  assert.equal(r.decision, 'allow');
});
