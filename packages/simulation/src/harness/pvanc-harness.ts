/**
 * PVANC simulation harness (dev/test only).
 *
 * Runs an observer scenario through a real PvancSession and summarises the
 * module's outputs for assertion and reporting. Stochastic scenarios are run
 * over many seeds so conclusions are about behaviour, not a lucky draw.
 */

import { createRng } from '@vision-platform/core-engine';
import { PvancSession, type PvancSessionConfig } from '@vision-platform/module-acuity-pvanc';
import { PHONE_SIGNALS, type ObserverScenario } from '../observers/pvanc-observers.ts';

export interface ScenarioOutcome {
  id: string;
  status: 'completed' | 'inconclusive' | 'blocked';
  estimate: number | null;
  category: string | null;
  quality: number | null;
  band: string | null;
  permittedOutput: string;
  distanceComponent: number | null;
  adequacyPasses: boolean;
  qualityCap: number | null;
  flags: string[];
  totalTrials: number;
  validPhase2: number;
}

export function runScenario(scenario: ObserverScenario, seed: string): ScenarioOutcome {
  const responder = scenario.makeResponder(createRng(`${scenario.id}:${seed}:obs`));
  const cfg: PvancSessionConfig = {
    sessionId: `${scenario.id}-${seed}`,
    seed: `${scenario.id}:${seed}:sess`,
    deviceSignals: PHONE_SIGNALS,
    distance: { method: 'cord-measured', valueMetres: 2 },
    age: 30,
    ...scenario.configOverrides,
  };
  const r = new PvancSession(cfg).run(responder);

  return {
    id: scenario.id,
    status: r.status,
    estimate: r.result ? (r.result.estimate as unknown as number) : null,
    category: r.result?.category ?? null,
    quality: r.quality?.value ?? null,
    band: r.quality?.band ?? null,
    permittedOutput: r.permittedOutput,
    distanceComponent: r.quality?.components['distance']?.value ?? null,
    adequacyPasses: r.calibrationProfile.adequacy.passes,
    qualityCap: r.calibrationProfile.adequacy.qualityCap ?? null,
    flags: r.quality ? r.quality.flags.map((f) => f.code) : [],
    totalTrials: r.trials.length,
    validPhase2: r.export.reliability?.trialCounts.validPhase2 ?? 0,
  };
}

export interface AggregateOutcome {
  id: string;
  runs: number;
  statuses: Record<string, number>;
  meanEstimate: number | null;
  estimateBias: number | null; // mean estimate − ground truth (null if no ground truth)
  rmse: number | null;
  meanQuality: number | null;
  completedFraction: number;
  /** A representative single run (first seed) for flags/adequacy inspection. */
  sample: ScenarioOutcome;
}

export function runScenarioMany(scenario: ObserverScenario, runs = 30): AggregateOutcome {
  const outcomes: ScenarioOutcome[] = [];
  for (let i = 0; i < runs; i++) outcomes.push(runScenario(scenario, `s${i}`));

  const statuses: Record<string, number> = {};
  for (const o of outcomes) statuses[o.status] = (statuses[o.status] ?? 0) + 1;

  const completed = outcomes.filter((o) => o.status === 'completed' && o.estimate !== null);
  const estimates = completed.map((o) => o.estimate as number);
  const meanEstimate = estimates.length ? estimates.reduce((a, b) => a + b, 0) / estimates.length : null;

  const gt = scenario.groundTruthLogMAR;
  const estimateBias = meanEstimate !== null && gt !== null ? meanEstimate - gt : null;
  const rmse =
    gt !== null && estimates.length
      ? Math.sqrt(estimates.reduce((a, b) => a + (b - gt) ** 2, 0) / estimates.length)
      : null;

  const qualities = outcomes.map((o) => o.quality).filter((q): q is number => q !== null);
  const meanQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null;

  return {
    id: scenario.id,
    runs,
    statuses,
    meanEstimate,
    estimateBias,
    rmse,
    meanQuality,
    completedFraction: outcomes.filter((o) => o.status === 'completed').length / runs,
    sample: outcomes[0]!,
  };
}
