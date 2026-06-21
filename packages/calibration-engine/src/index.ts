/**
 * @vision-platform/calibration-engine — device, distance, geometry, adequacy.
 *
 * Converts physical-unit stimulus requests to device pixels and records the
 * measurement context (device profile, viewing distance + uncertainty, ambient
 * environment, pixel-density adequacy). See README.md and ARCHITECTURE §5.
 */

export {
  resolveDeviceProfile,
  type ResolvedDeviceProfile,
} from './device-profile/device-profile.ts';
export {
  acquireDistance,
  relativeUncertainty,
  distanceConfidence,
  type AcquireDistanceOptions,
} from './distance/distance.ts';
export { degToPx, pxToDeg, pixelsPerDegree } from './geometry/geometry.ts';
export {
  adequacy,
  type AdequacyInput,
  type CoreAdequacyReport,
} from './adequacy-checks/adequacy.ts';
export {
  captureEnvironment,
  type EnvironmentSnapshot,
} from './environment/environment.ts';
