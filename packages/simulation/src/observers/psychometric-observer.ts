/**
 * Psychometric virtual observer.
 *
 * A simulated subject with KNOWN ground-truth parameters. Driving an adaptive
 * procedure with one of these and checking that the engine recovers the known
 * threshold is the canonical way to validate the measurement core (ARCHITECTURE
 * §8). The observer works in the engine's strength convention; producing a full,
 * module-shaped ResponseEvent is a module concern and is intentionally not done
 * here.
 *
 * NOTE: dev/off-device only — never shipped in a production build.
 */

import { cumulativeGaussian, type PsiParams, type PsychometricFn } from '@vision-platform/core-engine';
import type { SeededRng } from '@vision-platform/core-contracts';

export class PsychometricObserver {
  readonly params: PsiParams;
  private readonly psychometric: PsychometricFn;

  constructor(params: PsiParams, psychometric: PsychometricFn = cumulativeGaussian) {
    this.params = params;
    this.psychometric = psychometric;
  }

  /** Probability of a correct response at a given stimulus strength. */
  pCorrect(strength: number): number {
    return this.psychometric(strength, this.params);
  }

  /** Sample a correct/incorrect response using the injected RNG (deterministic). */
  respond(strength: number, rng: SeededRng): boolean {
    return rng.next() < this.pCorrect(strength);
  }
}
