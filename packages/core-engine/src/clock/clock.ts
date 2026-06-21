/**
 * Monotonic clock abstraction.
 *
 * All engine timing flows through an injected Clock so that (a) production code
 * uses a monotonic high-resolution source and (b) tests/simulation use a
 * controllable clock for deterministic, fast timing assertions (ARCHITECTURE §4).
 */

import type { Millis } from '@vision-platform/core-contracts';

export interface Clock {
  /** Monotonic milliseconds. Only differences are meaningful, not the origin. */
  now(): Millis;
}

/**
 * Production clock backed by a monotonic source. Falls back to Date.now() only
 * if performance.now() is unavailable (never the case on supported platforms).
 */
export class SystemClock implements Clock {
  now(): Millis {
    const perf = (globalThis as { performance?: { now(): number } }).performance;
    return (perf ? perf.now() : Date.now()) as Millis;
  }
}

/** Test/simulation clock with explicit, manual advancement. */
export class ManualClock implements Clock {
  private t: number;

  constructor(start = 0) {
    this.t = start;
  }

  now(): Millis {
    return this.t as Millis;
  }

  /** Advance time forward by a non-negative delta. */
  advance(deltaMs: number): void {
    if (deltaMs < 0) throw new RangeError('cannot advance the clock backwards');
    this.t += deltaMs;
  }

  /** Set absolute time (must not move backwards — the clock is monotonic). */
  set(absoluteMs: number): void {
    if (absoluteMs < this.t) throw new RangeError('clock is monotonic; cannot move backwards');
    this.t = absoluteMs;
  }
}
