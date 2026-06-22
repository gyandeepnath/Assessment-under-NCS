/**
 * Response-validity detection (PVANC §5.2, §8.3, §11.1).
 *
 * A first-class check for non-compliance / guessing that the floor and
 * completeness gates can miss (a guesser who happens not to string together enough
 * consecutive errors and instead "completes" with a confident-looking poor result).
 *
 * The guesser's signature is being at chance BOTH overall AND on the easiest
 * (largest) optotypes — a flat psychometric where no stimulus size helps. This is
 * tested CONJUNCTIVELY so that genuine low vision is not flagged: a low-vision
 * observer may have modest overall accuracy, but their function is still monotonic
 * — they identify the largest optotypes well above chance. Only when performance
 * is at chance everywhere is the result deemed invalid.
 *
 * Also surfaces runs of anticipatory (too-fast) responses (§11.1). The engine
 * provides the mechanism; the module supplies the chance rate and thresholds.
 */

import type { QualityFlag } from '@vision-platform/core-contracts';

export interface ValidityTrial {
  /** Stimulus strength (higher = easier). */
  intensity: number;
  correct: boolean;
  usable: boolean;
  latencyMs: number;
}

export interface ValidityConfig {
  /** Chance rate of the forced-choice task (e.g. 0.25 for 4AFC). */
  chanceRate: number;
  /**
   * Width (in strength units) of the top band treated as "easy": trials with
   * intensity >= maxPresented − topBand (default 0.1). Using the absolute largest
   * optotypes — which any observer with measurable vision identifies — is what
   * separates a guesser (at chance even there) from genuine (even low) vision.
   */
  topBand?: number;
  /**
   * Minimum easy trials required to judge validity (default 5). A completing
   * guesser clusters many responses at the largest sizes and exceeds it; genuine
   * observers either have few top-band trials (→ skipped, treated valid) or are
   * clearly above chance there.
   */
  minEasyTrials?: number;
  /**
   * Minimum accuracy on easy (largest-optotype) trials for a compliant observer
   * (default chance + 0.2). Below this, performance on the easiest items is at
   * chance — one half of the invalidity test.
   */
  easyAccuracyFloor?: number;
  /**
   * Minimum OVERALL usable accuracy for a compliant observer (default chance +
   * 0.15). An adaptive procedure keeps a genuine observer near their threshold at
   * well above chance; a guesser sits near chance. The other half of the test.
   */
  overallAccuracyFloor?: number;
  /** Minimum usable trials before overall accuracy is judged (default 12). */
  minUsableTrials?: number;
  /** Responses faster than this are anticipatory (default 200 ms). */
  anticipationMs?: number;
  /** Consecutive anticipatory responses that trigger a rapid-guessing flag (default 3). */
  maxConsecutiveRapid?: number;
}

export interface ValidityVerdict {
  valid: boolean;
  reason?: string;
  flags: QualityFlag[];
  easyTrialCount: number;
  easyTrialAccuracy: number | null;
  overallAccuracy: number | null;
  consecutiveRapidMax: number;
}

export function assessResponseValidity(trials: readonly ValidityTrial[], cfg: ValidityConfig): ValidityVerdict {
  const flags: QualityFlag[] = [];

  // --- Runs of anticipatory responses (§11.1). ---
  const anticipationMs = cfg.anticipationMs ?? 200;
  const maxConsecutiveRapid = cfg.maxConsecutiveRapid ?? 3;
  let run = 0;
  let consecutiveRapidMax = 0;
  for (const t of trials) {
    if (t.latencyMs < anticipationMs) {
      run += 1;
      consecutiveRapidMax = Math.max(consecutiveRapidMax, run);
    } else {
      run = 0;
    }
  }
  if (consecutiveRapidMax >= maxConsecutiveRapid) {
    flags.push({
      code: 'rapid-guessing',
      severity: 'degrade',
      message: `${consecutiveRapidMax} consecutive responses under ${anticipationMs} ms (possible guessing)`,
    });
  }

  // --- At-chance BOTH overall AND on the easiest stimuli ⇒ invalid. ---
  const usable = trials.filter((t) => t.usable);
  let easyTrialCount = 0;
  let easyTrialAccuracy: number | null = null;
  let overallAccuracy: number | null = null;
  let valid = true;
  let reason: string | undefined;

  if (usable.length > 0) {
    overallAccuracy = usable.filter((t) => t.correct).length / usable.length;

    const topBand = cfg.topBand ?? 0.1;
    const cutoff = Math.max(...usable.map((t) => t.intensity)) - topBand;
    const easy = usable.filter((t) => t.intensity >= cutoff - 1e-9);
    easyTrialCount = easy.length;
    if (easyTrialCount > 0) easyTrialAccuracy = easy.filter((t) => t.correct).length / easyTrialCount;

    // Floors can be set generously because the test is CONJUNCTIVE: a genuine
    // observer (even low-vision) passes at least one conjunct — high overall
    // accuracy OR high accuracy on the largest optotypes — so only at-chance-
    // everywhere (guessing) fails both.
    const minUsable = cfg.minUsableTrials ?? 12;
    const minEasy = cfg.minEasyTrials ?? 5;
    const overallFloor = cfg.overallAccuracyFloor ?? cfg.chanceRate + 0.15;
    const easyFloor = cfg.easyAccuracyFloor ?? cfg.chanceRate + 0.2;

    const overallAtChance = usable.length >= minUsable && overallAccuracy < overallFloor;
    const easyAtChance = easyTrialCount >= minEasy && (easyTrialAccuracy as number) < easyFloor;

    if (overallAtChance && easyAtChance) {
      valid = false;
      reason = `responses are at chance both overall (${Math.round(overallAccuracy * 100)}%) and on the easiest optotypes (${Math.round((easyTrialAccuracy as number) * 100)}%, chance ${Math.round(cfg.chanceRate * 100)}%) — the result is unreliable (possible guessing or difficulty with the task)`;
      flags.push({ code: 'invalid-response-pattern', severity: 'degrade', message: reason });
    }
  }

  return {
    valid,
    ...(reason ? { reason } : {}),
    flags,
    easyTrialCount,
    easyTrialAccuracy,
    overallAccuracy,
    consecutiveRapidMax,
  };
}
