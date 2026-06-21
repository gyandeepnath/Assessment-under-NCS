/**
 * Generic, engine-level quality checks.
 *
 * These are device/environment checks that apply regardless of construct — they
 * are NOT clinical-module scoring (that belongs to each module). They are
 * factories returning QualityCheck instances so thresholds stay configurable.
 * Rationale for each check follows PVANC §5.2 / §11, but the logic is generic.
 */

import type { QualityCheck, CheckResult } from '../hooks/hooks.ts';

/** Structural context for pre-flight environment checks (an EnvironmentSnapshot fits). */
export interface PreflightEnv {
  darkMode: 'on' | 'off' | 'unknown';
  colourFilter: 'on' | 'off' | 'unknown';
  autoBrightness: 'on' | 'off' | 'unknown';
  ambientLux: number | null;
  ambientAvailable: boolean;
  batteryLevel: number | null;
}

/** Dark mode alters optotype contrast/appearance → block until disabled. */
export const darkModeCheck: QualityCheck<PreflightEnv> = {
  code: 'dark-mode',
  phase: 'preflight',
  run: (ctx): CheckResult =>
    ctx.darkMode === 'on' ? { kind: 'block', reason: 'dark mode is enabled' } : { kind: 'pass' },
};

/** Colour filters alter stimulus appearance → block. */
export const colourFilterCheck: QualityCheck<PreflightEnv> = {
  code: 'colour-filter',
  phase: 'preflight',
  run: (ctx): CheckResult =>
    ctx.colourFilter === 'on' ? { kind: 'block', reason: 'a colour filter is active' } : { kind: 'pass' },
};

/** Auto-brightness changes luminance mid-test → flag (degrade), proceed. */
export const autoBrightnessCheck: QualityCheck<PreflightEnv> = {
  code: 'auto-brightness',
  phase: 'preflight',
  run: (ctx): CheckResult =>
    ctx.autoBrightness === 'on'
      ? { kind: 'flag', flag: { code: 'auto-brightness', severity: 'degrade', message: 'auto-brightness is on; luminance may drift' } }
      : { kind: 'pass' },
};

export function illuminanceRangeCheck(minLux = 50, maxLux = 1000): QualityCheck<PreflightEnv> {
  return {
    code: 'illuminance-range',
    phase: 'preflight',
    run: (ctx): CheckResult => {
      if (!ctx.ambientAvailable || ctx.ambientLux === null) {
        return { kind: 'flag', flag: { code: 'illuminance-unknown', severity: 'info', message: 'ambient light sensor unavailable' } };
      }
      if (ctx.ambientLux < minLux || ctx.ambientLux > maxLux) {
        return {
          kind: 'flag',
          flag: { code: 'illuminance-out-of-range', severity: 'degrade', message: `ambient ${ctx.ambientLux} lux outside [${minLux}, ${maxLux}]` },
        };
      }
      return { kind: 'pass' };
    },
  };
}

export function lowBatteryCheck(minLevel = 0.2): QualityCheck<PreflightEnv> {
  return {
    code: 'low-battery',
    phase: 'preflight',
    run: (ctx): CheckResult =>
      ctx.batteryLevel !== null && ctx.batteryLevel < minLevel
        ? { kind: 'flag', flag: { code: 'low-battery', severity: 'warn', message: 'low battery may affect brightness consistency' } }
        : { kind: 'pass' },
  };
}

/** In-flight latency check. Context is a single trial's timing classification. */
export interface TrialTimingContext {
  classification: 'valid' | 'anticipatory' | 'timeout';
}

export const latencyAnomalyCheck: QualityCheck<TrialTimingContext> = {
  code: 'response-latency',
  phase: 'inflight',
  run: (ctx): CheckResult => {
    if (ctx.classification === 'anticipatory') {
      return { kind: 'flag', flag: { code: 'anticipatory-response', severity: 'degrade', message: 'response faster than plausible (possible guess)' } };
    }
    if (ctx.classification === 'timeout') {
      return { kind: 'flag', flag: { code: 'response-timeout', severity: 'warn', message: 'no response within the window' } };
    }
    return { kind: 'pass' };
  },
};
