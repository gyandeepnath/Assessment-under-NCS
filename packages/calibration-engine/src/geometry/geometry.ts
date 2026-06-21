/**
 * Geometry — the single authoritative degrees ⇄ pixels mapping.
 *
 * Modules specify stimuli in degrees of visual angle (physical units); this is
 * the one place that converts to device pixels, so no module re-derives the
 * relationship (ARCHITECTURE §5). The mapping depends on viewing distance and the
 * device pixel pitch:
 *
 *   size_mm = 2 · distance_mm · tan(angle / 2)
 *   pixels  = size_mm / pixelPitch_mm
 */

import type { Degrees, Pixels, DeviceProfile, DistanceEstimate } from '@vision-platform/core-contracts';

const MM_PER_M = 1000;

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function degToPx(angle: Degrees, device: DeviceProfile, distance: DistanceEstimate): Pixels {
  if (angle < 0) throw new RangeError('angle must be >= 0');
  const distMm = distance.value * MM_PER_M;
  const sizeMm = 2 * distMm * Math.tan(deg2rad(angle) / 2);
  return (sizeMm / device.pixelPitch) as Pixels;
}

export function pxToDeg(px: Pixels, device: DeviceProfile, distance: DistanceEstimate): Degrees {
  const sizeMm = px * device.pixelPitch;
  const distMm = distance.value * MM_PER_M;
  const rad = 2 * Math.atan(sizeMm / (2 * distMm));
  return ((rad * 180) / Math.PI) as Degrees;
}

/** Pixels subtended by one degree at the current distance (≈ small-angle linear). */
export function pixelsPerDegree(device: DeviceProfile, distance: DistanceEstimate): number {
  return degToPx(1 as Degrees, device, distance);
}
