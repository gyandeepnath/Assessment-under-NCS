/**
 * Pixel-density adequacy gate.
 *
 * Determines whether a device can resolve the detail a module needs at the
 * current distance (ARCHITECTURE §5; PVANC §10.3). The check is scale-agnostic:
 * it works in arcminutes of the smallest renderable detail and leaves the
 * conversion to a construct scale (e.g. logMAR) to the module. When the device
 * cannot resolve the required detail, the gate returns a quality cap rather than
 * silently producing an over-confident measurement.
 */

import type { DeviceProfile, DistanceEstimate } from '@vision-platform/core-contracts';
import { pixelsPerDegree } from '../geometry/geometry.ts';

const ARCMIN_PER_DEG = 60;

export interface AdequacyInput {
  device: DeviceProfile;
  distance: DistanceEstimate;
  /** Required smallest detail (arcmin) the module must render, e.g. an optotype stroke. */
  requiredDetailArcmin: number;
  /** Minimum pixels that detail must occupy to avoid pixelation (default 2). */
  minPixelsPerDetail?: number;
  /** Quality cap (0..100) applied when the gate does not pass (default 70). */
  qualityCapOnFail?: number;
}

export interface CoreAdequacyReport {
  passes: boolean;
  pixelsPerDegree: number;
  /** Smallest detail (arcmin) the device can render at minPixelsPerDetail. */
  limitArcmin: number;
  qualityCap?: number;
}

export function adequacy(input: AdequacyInput): CoreAdequacyReport {
  const minPx = input.minPixelsPerDetail ?? 2;
  const ppd = pixelsPerDegree(input.device, input.distance);
  const arcminPerPixel = ARCMIN_PER_DEG / ppd;
  const limitArcmin = arcminPerPixel * minPx;
  const passes = input.requiredDetailArcmin >= limitArcmin;
  return {
    passes,
    pixelsPerDegree: ppd,
    limitArcmin,
    ...(passes ? {} : { qualityCap: input.qualityCapOnFail ?? 70 }),
  };
}
