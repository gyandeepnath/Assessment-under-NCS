/**
 * Environment / ambient-light capture.
 *
 * Captures the session's environmental context from host signals. Ambient light
 * is captured "if available" (scope) — many devices lack an exposed lux sensor —
 * so the snapshot records availability explicitly instead of inventing a value.
 * Range evaluation (whether the lux is acceptable) is a quality concern and lives
 * in the quality engine; this module only captures.
 */

import type { DeviceSignals, ISO8601 } from '@vision-platform/core-contracts';

export interface EnvironmentSnapshot {
  ambientLux: number | null;
  ambientAvailable: boolean;
  brightnessSetting: number | null;
  autoBrightness: 'on' | 'off' | 'unknown';
  darkMode: 'on' | 'off' | 'unknown';
  colourFilter: 'on' | 'off' | 'unknown';
  orientation: 'portrait' | 'landscape' | 'unknown';
  batteryLevel: number | null;
  capturedAt: ISO8601;
}

export function captureEnvironment(signals: DeviceSignals): EnvironmentSnapshot {
  const ambientAvailable = typeof signals.ambientLux === 'number' && Number.isFinite(signals.ambientLux);
  return {
    ambientLux: ambientAvailable ? (signals.ambientLux as number) : null,
    ambientAvailable,
    brightnessSetting: typeof signals.brightnessSetting === 'number' ? signals.brightnessSetting : null,
    autoBrightness: signals.autoBrightness ?? 'unknown',
    darkMode: signals.darkMode ?? 'unknown',
    colourFilter: signals.colourFilter ?? 'unknown',
    orientation: signals.orientation ?? 'unknown',
    batteryLevel: typeof signals.batteryLevel === 'number' ? signals.batteryLevel : null,
    capturedAt: signals.capturedAt,
  };
}
