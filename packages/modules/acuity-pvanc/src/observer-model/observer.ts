/**
 * Reference virtual observer (PVANC; engine §8).
 *
 * A simulated subject with a known true acuity, used to validate the procedure by
 * ground-truth recovery and to drive headless tests. Works in logMAR space: the
 * probability of a correct response at a presented size follows the psychometric
 * function. Dev/test only — never shipped.
 */

import { cumulativeGaussian, type EngineRng } from '@vision-platform/core-engine';
import type {
  StimulusSpec,
  ResponseEvent,
  VirtualObserver,
  ObserverParams,
  SeededRng,
  Millis,
} from '@vision-platform/core-contracts';
import { wrongOrientation } from '../stimulus/tumbling-e.ts';

export interface PvancObserverParams {
  trueLogMAR: number;
  slope?: number;
  guessRate?: number;
  lapseRate?: number;
  latencyMeanMs?: number;
  latencySdMs?: number;
}

export interface ResponseDraw {
  rawValue: string;
  latencyMs: number;
}

/** A function that produces a response to a stimulus (host UI or virtual observer). */
export type Responder = (stimulus: StimulusSpec) => ResponseDraw;

const DEFAULTS = { slope: 2.0, guessRate: 0.25, lapseRate: 0.02, latencyMeanMs: 800, latencySdMs: 200 };

/** Probability of a correct identification at the presented size. */
export function pCorrect(stimulus: StimulusSpec, params: PvancObserverParams): number {
  const logMAR = stimulus.intensity as unknown as number;
  return cumulativeGaussian(logMAR, {
    threshold: params.trueLogMAR,
    slope: params.slope ?? DEFAULTS.slope,
    guessRate: params.guessRate ?? DEFAULTS.guessRate,
    lapseRate: params.lapseRate ?? DEFAULTS.lapseRate,
  });
}

/**
 * Build a deterministic responder backed by the psychometric model. Latency is
 * sampled to land inside the valid window so the simulated subject is, by
 * default, a well-behaved observer (edge cases are exercised by custom responders).
 */
export function makePvancResponder(params: PvancObserverParams, rng: EngineRng): Responder {
  return (stimulus) => {
    const correct = rng.next() < pCorrect(stimulus, params);
    const rawValue = correct ? stimulus.identity : wrongOrientation(stimulus.identity, rng);
    const mean = params.latencyMeanMs ?? DEFAULTS.latencyMeanMs;
    const sd = params.latencySdMs ?? DEFAULTS.latencySdMs;
    const latencyMs = clamp(Math.round(mean + gaussian(rng) * sd), 300, 4500);
    return { rawValue, latencyMs };
  };
}

/** Contract-shaped observer (PVANC §3.2 referenceObserver). */
export function referenceObserver(params: ObserverParams): VirtualObserver {
  const p: PvancObserverParams = {
    trueLogMAR: params.trueThreshold as unknown as number,
    slope: params.slope,
    guessRate: params.guessRate,
    lapseRate: params.lapseRate,
  };
  return {
    groundTruth: params,
    respond(stimulus: StimulusSpec, rng: SeededRng): ResponseEvent {
      const correct = rng.next() < pCorrect(stimulus, p);
      const rawValue = correct ? stimulus.identity : wrongOrientation(stimulus.identity, rng);
      const latencyMs = 800;
      return {
        stimulusId: stimulus.identity,
        onsetTimestamp: 0 as Millis,
        responseTimestamp: latencyMs as Millis,
        latencyMs,
        rawValue,
        inputModality: 'swipe',
      };
    },
  };
}

/** Standard-normal sample via Box–Muller, driven by the seeded RNG. */
function gaussian(rng: EngineRng): number {
  const u1 = Math.max(rng.next(), 1e-12);
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
