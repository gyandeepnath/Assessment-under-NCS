/**
 * Device profiling & screen/display metadata capture.
 *
 * Resolves a DeviceProfile (pixel pitch, screen size, max luminance) for the
 * device under test. Resolution order:
 *   1. exact match in the curated device database (highest confidence);
 *   2. derive pixel pitch from reported PPI or from resolution + physical size;
 *   3. fall back to a per-device-CLASS default (flagged `isFallback`).
 *
 * The platform must not hard-code a single device class (ARCHITECTURE §13.2), so
 * the fallback table covers the supported classes and the result always records
 * whether it came from real metadata or a generic assumption.
 */

import type { DeviceProfile } from '@vision-platform/core-contracts';
import type { DeviceSignals, DeviceClass } from '@vision-platform/core-contracts';

interface DeviceDbEntry {
  pixelPitchMm: number; // millimetres per pixel
  screenWidthMm: number;
  screenHeightMm: number;
  maxLuminanceCd: number;
}

/**
 * Curated database. Intentionally small here — the real database is a versioned
 * data asset (ARCHITECTURE §5). Entries are keyed by the host-reported model id.
 */
const DEVICE_DB: Readonly<Record<string, DeviceDbEntry>> = {
  // iPhone 15 Pro: 460 ppi → 25.4/460 ≈ 0.05522 mm/px
  'iPhone16,1': { pixelPitchMm: 0.05522, screenWidthMm: 70.6, screenHeightMm: 153.0, maxLuminanceCd: 1000 },
  // iPad Pro 11" (~264 ppi)
  'iPad14,3': { pixelPitchMm: 0.09621, screenWidthMm: 178.5, screenHeightMm: 247.6, maxLuminanceCd: 600 },
};

/**
 * Per-class fallback pixel pitch (mm/px) for when no metadata is available.
 * Representative mid-range values, NOT precise — hence `isFallback = true`.
 */
const CLASS_FALLBACK: Readonly<Record<DeviceClass, DeviceDbEntry>> = {
  smartphone: { pixelPitchMm: 0.0615, screenWidthMm: 71, screenHeightMm: 155, maxLuminanceCd: 500 },
  tablet: { pixelPitchMm: 0.096, screenWidthMm: 179, screenHeightMm: 248, maxLuminanceCd: 500 },
  desktop: { pixelPitchMm: 0.2724, screenWidthMm: 600, screenHeightMm: 340, maxLuminanceCd: 300 },
  other: { pixelPitchMm: 0.15, screenWidthMm: 150, screenHeightMm: 250, maxLuminanceCd: 300 },
};

const MM_PER_INCH = 25.4;

export interface ResolvedDeviceProfile extends DeviceProfile {
  /** How the pixel pitch was determined (for audit/quality). */
  source: 'database' | 'reported-ppi' | 'resolution+size' | 'class-fallback';
}

export function resolveDeviceProfile(signals: DeviceSignals): ResolvedDeviceProfile {
  // 1. Curated database by exact model id.
  if (signals.deviceModel && DEVICE_DB[signals.deviceModel]) {
    const e = DEVICE_DB[signals.deviceModel]!;
    return profile(signals.deviceModel, e, false, 'database');
  }

  // 2a. Reported PPI.
  if (signals.reportedPpi && signals.reportedPpi > 0) {
    const pitch = MM_PER_INCH / signals.reportedPpi;
    const e = withPitch(signals, pitch, signals.deviceClass);
    return profile(signals.deviceModel ?? 'unknown', e, true, 'reported-ppi');
  }

  // 2b. Resolution + physical diagonal → derive PPI → pitch.
  if (
    signals.screenWidthPx &&
    signals.screenHeightPx &&
    signals.reportedDiagonalInches &&
    signals.reportedDiagonalInches > 0
  ) {
    const diagPx = Math.hypot(signals.screenWidthPx, signals.screenHeightPx);
    const ppi = diagPx / signals.reportedDiagonalInches;
    const pitch = MM_PER_INCH / ppi;
    const e = withPitch(signals, pitch, signals.deviceClass);
    return profile(signals.deviceModel ?? 'unknown', e, true, 'resolution+size');
  }

  // 3. Per-class fallback.
  const fb = CLASS_FALLBACK[signals.deviceClass];
  return profile(signals.deviceModel ?? `generic-${signals.deviceClass}`, fb, true, 'class-fallback');
}

function withPitch(signals: DeviceSignals, pitchMm: number, cls: DeviceClass): DeviceDbEntry {
  const fb = CLASS_FALLBACK[cls];
  const widthMm = signals.screenWidthPx ? signals.screenWidthPx * pitchMm : fb.screenWidthMm;
  const heightMm = signals.screenHeightPx ? signals.screenHeightPx * pitchMm : fb.screenHeightMm;
  return { pixelPitchMm: pitchMm, screenWidthMm: widthMm, screenHeightMm: heightMm, maxLuminanceCd: fb.maxLuminanceCd };
}

function profile(
  model: string,
  e: DeviceDbEntry,
  isFallback: boolean,
  source: ResolvedDeviceProfile['source'],
): ResolvedDeviceProfile {
  return {
    deviceModel: model,
    pixelPitch: e.pixelPitchMm as DeviceProfile['pixelPitch'],
    screenWidth: e.screenWidthMm as DeviceProfile['screenWidth'],
    screenHeight: e.screenHeightMm as DeviceProfile['screenHeight'],
    maxLuminance: e.maxLuminanceCd as DeviceProfile['maxLuminance'],
    isFallback,
    source,
  };
}
