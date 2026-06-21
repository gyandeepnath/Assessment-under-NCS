/**
 * Calibration contract (contract only).
 *
 * Converts the module's physical-unit stimulus requests into something a
 * specific device can faithfully present, and records the CONTEXT of a
 * measurement so it can be reproduced and compared longitudinally.
 *
 * A CalibrationProfile is a required input to start measuring; low-confidence
 * inputs (e.g. user-reported distance) propagate into the quality score —
 * the platform never pretends a low-confidence context is high-confidence.
 *
 * See docs/architecture/ARCHITECTURE.md §5.
 */

import type {
  UUID,
  ISO8601,
  Degrees,
  Pixels,
  Metres,
  Millimetres,
  Candela,
  ScaleRange,
} from './units';
import type { DeviceSignals } from './platform.contract';

export type DistanceMethod =
  | 'cord-measured'
  | 'camera-estimated' // [UNCERTAIN] — always degrades quality, never trusted silently
  | 'user-reported'
  | 'unknown';

export interface DistanceEstimate {
  value: Metres;
  method: DistanceMethod;
  uncertainty: Metres;
}

export interface DeviceProfile {
  deviceModel: string;
  pixelPitch: Millimetres; // per pixel
  screenWidth: Millimetres;
  screenHeight: Millimetres;
  maxLuminance: Candela;
  /** True when resolved from a generic fallback rather than the model DB. */
  isFallback: boolean;
}

export interface LuminanceState {
  target: Candela;
  achieved: Candela;
  residualError: Candela;
}

export interface AdequacyReport {
  passes: boolean;
  pixelsPerDegree: number;
  maxMeasurable: number; // on the module's scale
  qualityCap?: number; // 0..100 cap applied when device cannot resolve the range
}

export interface CalibrationProfile {
  profileId: UUID;
  deviceProfile: DeviceProfile;
  viewingDistance: DistanceEstimate;
  luminance: LuminanceState;
  adequacy: AdequacyReport;
  capturedAt: ISO8601;
  confidence: 'high' | 'moderate' | 'low';
}

export interface CalibrationRequirement {
  id: string;
  description: string;
}

export interface CalibrationContext {
  signals: DeviceSignals;
  [key: string]: unknown;
}

export interface CalibrationEngine {
  resolveDevice(signals: DeviceSignals): DeviceProfile;
  acquireDistance(method: DistanceMethod, signals: DeviceSignals): DistanceEstimate;
  buildProfile(req: CalibrationRequirement[], ctx: CalibrationContext): CalibrationProfile;
  /** The single authoritative degrees ⇄ pixels mapping. No module re-derives it. */
  degToPx(angle: Degrees, profile: CalibrationProfile): Pixels;
  adequacy(profile: CalibrationProfile, requiredRange: ScaleRange): AdequacyReport;
}
