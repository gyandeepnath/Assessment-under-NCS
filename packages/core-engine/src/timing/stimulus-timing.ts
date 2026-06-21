/**
 * Stimulus timing.
 *
 * Owns the temporal envelope of a single trial: when a stimulus was shown, how
 * long until the response, and whether that response was anticipatory, valid, or
 * a timeout. The engine does not render — it works from host-stamped timestamps —
 * so this module classifies timing rather than driving a display loop. The
 * minimum inter-stimulus interval is enforced between trials by the caller using
 * `earliestNextOnset()` (ARCHITECTURE §6.5).
 */

import type { Millis } from '@vision-platform/core-contracts';
import type { Clock } from '../clock/clock.ts';

export interface TimingConfig {
  /** Optional presentation cap; undefined = self-paced (PVANC §6.5). */
  presentationMs?: number;
  /** Minimum gap between one response and the next stimulus onset. */
  interStimulusMs: number;
  /** Maximum time to wait for a response before recording a timeout. */
  responseWindowMs: number;
  /** Responses faster than this are flagged as anticipatory guesses (default 200ms). */
  anticipationMs?: number;
}

export type TimingClassification = 'valid' | 'anticipatory' | 'timeout';

export interface TrialTiming {
  onset: Millis;
  responseAt: Millis | null;
  latencyMs: number | null;
  classification: TimingClassification;
}

const DEFAULT_ANTICIPATION_MS = 200;

export class StimulusTimer {
  private readonly clock: Clock;
  private readonly config: TimingConfig;

  constructor(clock: Clock, config: TimingConfig) {
    if (config.interStimulusMs < 0 || config.responseWindowMs <= 0) {
      throw new RangeError('interStimulusMs must be >= 0 and responseWindowMs > 0');
    }
    this.clock = clock;
    this.config = config;
  }

  /** Record (and return) the stimulus onset timestamp from the clock. */
  markOnset(): Millis {
    return this.clock.now();
  }

  /**
   * Classify a response against its onset. A null `responseAt` (no response
   * collected within the window) is treated as a timeout.
   */
  classify(onset: Millis, responseAt: Millis | null): TrialTiming {
    if (responseAt === null) {
      return { onset, responseAt: null, latencyMs: null, classification: 'timeout' };
    }
    const latencyMs = responseAt - onset;
    if (latencyMs < 0) throw new RangeError('responseAt precedes onset (non-monotonic clock?)');

    const anticipation = this.config.anticipationMs ?? DEFAULT_ANTICIPATION_MS;
    let classification: TimingClassification;
    if (latencyMs > this.config.responseWindowMs) classification = 'timeout';
    else if (latencyMs < anticipation) classification = 'anticipatory';
    else classification = 'valid';

    return { onset, responseAt, latencyMs, classification };
  }

  /** Earliest permissible onset for the next trial, enforcing the ISI. */
  earliestNextOnset(previousResponseAt: Millis): Millis {
    return (previousResponseAt + this.config.interStimulusMs) as Millis;
  }
}
