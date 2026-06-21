/**
 * Seeded, deterministic pseudo-random number generation.
 *
 * Determinism is an engine-wide requirement (ARCHITECTURE §0.6): given the same
 * seed, the engine must reproduce the same stimulus order, optotype identities,
 * and — together with a fixed response sequence — the same result. This enables
 * replay, simulation, and audit. The generator is NOT cryptographic.
 */

import type { SeededRng } from '@vision-platform/core-contracts';

/** FNV-1a string hash → 32-bit unsigned seed. Stable across runs/platforms. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Extends the minimal contract RNG with the helpers the engine needs. */
export interface EngineRng extends SeededRng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform choice from a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates shuffle returning a new array (input is not mutated). */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * mulberry32 — a compact, well-distributed 32-bit generator. Chosen over
 * Math.random() because it is seedable and reproducible, and over heavier
 * generators because stimulus selection does not need cryptographic quality.
 */
export class Mulberry32 implements EngineRng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('cannot pick from an empty list');
    return items[this.int(items.length)] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}

/** Factory used throughout the engine so the concrete generator stays swappable. */
export function createRng(seed: number | string): EngineRng {
  return new Mulberry32(seed);
}
