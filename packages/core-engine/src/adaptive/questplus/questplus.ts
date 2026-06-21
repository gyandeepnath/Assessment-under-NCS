/**
 * QUEST+ — Bayesian adaptive threshold (and slope) estimation.
 *
 * A faithful implementation of Watson (2017): maintain a posterior over a grid of
 * psychometric parameters; on each trial choose the stimulus that minimises the
 * EXPECTED entropy of the posterior (maximises information gain); update the
 * posterior by Bayes' rule given the observed outcome. The threshold estimate is
 * the posterior mean of μ (with its SD), supporting credible intervals and a
 * principled stopping rule on posterior width.
 *
 * This is the precision stage of the hybrid procedure (e.g. PVANC Phase 2) and is
 * deliberately not approximated away. The engine stays construct-agnostic: callers
 * supply the stimulus domain (in strength units), the parameter grids, fixed
 * guess/lapse rates, and optionally a different psychometric core.
 */

import {
  cumulativeGaussian,
  clampProb,
  type PsychometricFn,
} from '../psychometric/psychometric.ts';

export interface QuestPlusConfig {
  /** Candidate stimulus strengths the procedure may present. */
  stimulusDomain: number[];
  /** Parameter grid: thresholds (and slopes) under consideration. */
  thresholdGrid: number[];
  /** Slope grid; a single value pins the slope (estimates threshold only). */
  slopeGrid: number[];
  guessRate: number;
  lapseRate: number;
  /** Psychometric core (default cumulative Gaussian). */
  psychometric?: PsychometricFn;
  /** Optional prior over threshold (unnormalised); defaults to uniform. */
  priorThreshold?: (threshold: number) => number;
  /** Optional prior over slope (unnormalised); defaults to uniform. */
  priorSlope?: (slope: number) => number;
  /** Stop when posterior SD of threshold falls below this (if set). */
  stopSd?: number;
  /** Stop after this many trials (if set). */
  maxTrials?: number;
}

interface GridCell {
  threshold: number;
  slope: number;
}

export interface QuestEstimate {
  /** Posterior mean of threshold μ. */
  threshold: number;
  /** Posterior SD of threshold μ. */
  thresholdSd: number;
  /** Posterior mean of slope β (informative only if slopeGrid has >1 entry). */
  slope: number;
  trials: number;
}

export class QuestPlus {
  private readonly cells: GridCell[] = [];
  private posterior: number[] = [];
  /** Precomputed P(correct | stimulus, cell) lookup: [stimIndex][cellIndex]. */
  private readonly pCorrect: number[][] = [];
  private readonly psychometric: PsychometricFn;
  private trials = 0;
  private readonly config: QuestPlusConfig;

  constructor(config: QuestPlusConfig) {
    this.config = config;
    if (config.stimulusDomain.length === 0) throw new RangeError('stimulusDomain must be non-empty');
    if (config.thresholdGrid.length === 0 || config.slopeGrid.length === 0) {
      throw new RangeError('thresholdGrid and slopeGrid must be non-empty');
    }
    this.psychometric = config.psychometric ?? cumulativeGaussian;

    const priorT = config.priorThreshold ?? (() => 1);
    const priorS = config.priorSlope ?? (() => 1);

    // Build the parameter grid and the (unnormalised) prior, then normalise.
    const rawPrior: number[] = [];
    for (const threshold of config.thresholdGrid) {
      for (const slope of config.slopeGrid) {
        this.cells.push({ threshold, slope });
        rawPrior.push(priorT(threshold) * priorS(slope));
      }
    }
    this.posterior = normalise(rawPrior);

    // Precompute the likelihood table once (the expensive part of QUEST+).
    for (const stim of config.stimulusDomain) {
      const row: number[] = [];
      for (const cell of this.cells) {
        const p = this.psychometric(stim, {
          threshold: cell.threshold,
          slope: cell.slope,
          guessRate: config.guessRate,
          lapseRate: config.lapseRate,
        });
        row.push(clampProb(p));
      }
      this.pCorrect.push(row);
    }
  }

  get trialCount(): number {
    return this.trials;
  }

  /**
   * Select the next stimulus strength by minimising expected posterior entropy.
   * (Equivalently maximising expected information gain — Watson 2017, eq. 2–4.)
   */
  nextStimulus(): number {
    let bestIdx = 0;
    let bestExpectedEntropy = Number.POSITIVE_INFINITY;

    for (let s = 0; s < this.config.stimulusDomain.length; s++) {
      const row = this.pCorrect[s]!;

      // Marginal P(correct) under the current posterior for this stimulus.
      let pC = 0;
      for (let c = 0; c < this.cells.length; c++) pC += this.posterior[c]! * row[c]!;
      const pI = 1 - pC;

      // Expected entropy over the two possible outcomes.
      const hC = this.entropyAfter(row, pC, true);
      const hI = this.entropyAfter(row, pI, false);
      const expectedEntropy = pC * hC + pI * hI;

      if (expectedEntropy < bestExpectedEntropy) {
        bestExpectedEntropy = expectedEntropy;
        bestIdx = s;
      }
    }
    return this.config.stimulusDomain[bestIdx] as number;
  }

  /** Update the posterior given an observed outcome at a presented strength. */
  update(strength: number, correct: boolean): void {
    const s = this.config.stimulusDomain.indexOf(strength);
    if (s < 0) throw new RangeError(`strength ${strength} is not in the stimulus domain`);
    const row = this.pCorrect[s]!;

    const updated = this.posterior.map((prob, c) => {
      const likelihood = correct ? row[c]! : 1 - row[c]!;
      return prob * likelihood;
    });
    this.posterior = normalise(updated);
    this.trials += 1;
  }

  /** Posterior mean and SD of the threshold (and mean slope). */
  estimate(): QuestEstimate {
    let mThreshold = 0;
    let mSlope = 0;
    for (let c = 0; c < this.cells.length; c++) {
      mThreshold += this.posterior[c]! * this.cells[c]!.threshold;
      mSlope += this.posterior[c]! * this.cells[c]!.slope;
    }
    let varThreshold = 0;
    for (let c = 0; c < this.cells.length; c++) {
      const d = this.cells[c]!.threshold - mThreshold;
      varThreshold += this.posterior[c]! * d * d;
    }
    return {
      threshold: mThreshold,
      thresholdSd: Math.sqrt(Math.max(0, varThreshold)),
      slope: mSlope,
      trials: this.trials,
    };
  }

  isDone(): boolean {
    if (this.config.maxTrials !== undefined && this.trials >= this.config.maxTrials) return true;
    if (this.config.stopSd !== undefined && this.trials > 0) {
      return this.estimate().thresholdSd < this.config.stopSd;
    }
    return false;
  }

  /** Shannon entropy (nats) of the posterior after a hypothetical outcome. */
  private entropyAfter(row: number[], marginal: number, correct: boolean): number {
    if (marginal <= 0) return 0;
    let h = 0;
    for (let c = 0; c < this.cells.length; c++) {
      const likelihood = correct ? row[c]! : 1 - row[c]!;
      const post = (this.posterior[c]! * likelihood) / marginal;
      if (post > 0) h -= post * Math.log(post);
    }
    return h;
  }
}

function normalise(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || !Number.isFinite(sum)) {
    // Degenerate posterior → fall back to uniform rather than propagate NaN.
    return weights.map(() => 1 / weights.length);
  }
  return weights.map((w) => w / sum);
}
