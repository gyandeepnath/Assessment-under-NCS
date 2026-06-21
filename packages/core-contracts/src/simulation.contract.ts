/**
 * Simulation Port contract (contract only).
 *
 * Mirrors the Platform Port: instead of rendering a frame and awaiting a human
 * response, the harness asks a VirtualObserver to respond. The engine, modules,
 * calibration, and QC are UNCHANGED — only the edge is substituted. This makes
 * the whole measurement loop run headless and deterministically.
 *
 * See docs/architecture/ARCHITECTURE.md §8.
 */

import type { ModulePlugin, ObserverParams, VirtualObserver } from './module.contract.ts';
import type { CalibrationProfile } from './calibration.contract.ts';
import type { TrialRecord } from './storage.contract.ts';
import type { ScaleValue } from './units.ts';

export interface SimulationResult {
  recoveredEstimate: ScaleValue;
  groundTruth: ObserverParams;
  trials: TrialRecord[];
  seed: string;
}

export interface ParameterGrid {
  thresholds: ScaleValue[];
  slopes: number[];
  lapseRates: number[];
  seeds: string[];
}

export interface SimulationHarness {
  run(
    module: ModulePlugin,
    observer: VirtualObserver,
    cal: CalibrationProfile,
    seed: string,
  ): SimulationResult;
  sweep(grid: ParameterGrid): SimulationResult[];
}
