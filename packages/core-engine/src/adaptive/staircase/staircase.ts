/**
 * Transformed up/down staircase.
 *
 * A classic non-parametric adaptive method (Levitt 1971). After `nDown`
 * consecutive correct responses, strength steps DOWN (harder); after `nUp`
 * incorrect responses, strength steps UP (easier). A reversal is a change of
 * direction; the threshold estimate is the mean strength over the last
 * `reversalsForThreshold` reversals. Step size may shrink after early reversals.
 *
 * In the engine's strength convention, lower strength = harder. The transformed
 * rule converges on the stimulus level for a target proportion correct fixed by
 * (nDown, nUp) — e.g. 3-down/1-up ≈ 79.4% correct. This is used for fast
 * bracketing (e.g. PVANC Phase 1) and is not a substitute for the Bayesian
 * estimator's precision.
 */

export interface StaircaseConfig {
  startStrength: number;
  /** Consecutive correct responses needed to step down (harder). */
  nDown: number;
  /** Incorrect responses needed to step up (easier). */
  nUp: number;
  /**
   * Step size per move. If an array, successive entries are used after each of
   * the first reversals, with the last entry held thereafter (step-shrinking).
   */
  stepSize: number | number[];
  minStrength: number;
  maxStrength: number;
  /** Stop after this many reversals (if set). */
  maxReversals?: number;
  /** Stop after this many trials (if set). */
  maxTrials?: number;
  /** Reversals averaged for the final threshold (default 6, even number preferred). */
  reversalsForThreshold?: number;
}

export class Staircase {
  private strength: number;
  private consecutiveCorrect = 0;
  private consecutiveIncorrect = 0;
  private lastDirection: -1 | 0 | 1 = 0;
  private trials = 0;
  private readonly reversalStrengths: number[] = [];
  private readonly config: StaircaseConfig;

  constructor(config: StaircaseConfig) {
    if (config.nDown < 1 || config.nUp < 1) throw new RangeError('nDown and nUp must be >= 1');
    if (config.minStrength >= config.maxStrength) throw new RangeError('minStrength must be < maxStrength');
    this.config = config;
    this.strength = clamp(config.startStrength, config.minStrength, config.maxStrength);
  }

  /** Strength to present on the next trial. */
  get nextStrength(): number {
    return this.strength;
  }

  get reversalCount(): number {
    return this.reversalStrengths.length;
  }

  get trialCount(): number {
    return this.trials;
  }

  /** Record a response and update the staircase state. */
  update(correct: boolean): void {
    this.trials += 1;
    if (correct) {
      this.consecutiveCorrect += 1;
      this.consecutiveIncorrect = 0;
    } else {
      this.consecutiveIncorrect += 1;
      this.consecutiveCorrect = 0;
    }

    let move: -1 | 0 | 1 = 0;
    if (correct && this.consecutiveCorrect >= this.config.nDown) {
      move = -1; // harder
      this.consecutiveCorrect = 0;
    } else if (!correct && this.consecutiveIncorrect >= this.config.nUp) {
      move = 1; // easier
      this.consecutiveIncorrect = 0;
    }

    if (move !== 0) {
      if (this.lastDirection !== 0 && move !== this.lastDirection) {
        this.reversalStrengths.push(this.strength); // reversal at the pre-step level
      }
      this.lastDirection = move;
      this.strength = clamp(this.strength + move * this.currentStep(), this.config.minStrength, this.config.maxStrength);
    }
  }

  isDone(): boolean {
    if (this.config.maxReversals !== undefined && this.reversalStrengths.length >= this.config.maxReversals) {
      return true;
    }
    if (this.config.maxTrials !== undefined && this.trials >= this.config.maxTrials) return true;
    return false;
  }

  /** Threshold = mean of the last N reversal strengths (falls back to current strength). */
  threshold(): number {
    const n = this.config.reversalsForThreshold ?? 6;
    if (this.reversalStrengths.length === 0) return this.strength;
    const used = this.reversalStrengths.slice(-n);
    return used.reduce((a, b) => a + b, 0) / used.length;
  }

  /** Reversal strengths in order (for diagnostics/logging). */
  reversals(): readonly number[] {
    return this.reversalStrengths;
  }

  private currentStep(): number {
    const s = this.config.stepSize;
    if (typeof s === 'number') return s;
    const idx = Math.min(this.reversalStrengths.length, s.length - 1);
    return s[idx] as number;
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
