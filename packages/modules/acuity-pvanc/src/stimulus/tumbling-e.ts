/**
 * Tumbling-E optotype construction.
 *
 * Builds the physical-unit (degrees of visual angle) geometry of a tumbling E at
 * a given logMAR size, with contour-interaction (crowding) bars, plus the
 * StimulusSpec the engine/host consume. All sizes are derived from the minimum
 * angle of resolution (MAR); the calibration engine later converts degrees to
 * device pixels (PVANC §6.4, §7).
 *
 *   MAR_arcmin   = 10^logMAR           (the critical detail / stroke / gap)
 *   height       = 5 × stroke          (5×5 optotype grid)
 *   crowding bar : thickness = stroke, edge-to-edge spacing = 2 × stroke,
 *                  length extends 0.5 × height beyond each edge → 2 × height total
 */

import type {
  StimulusSpec,
  StimulusRequest,
  SeededRng,
  Degrees,
  ScaleValue,
  Candela,
  WeberContrast,
} from '@vision-platform/core-contracts';

export const ORIENTATIONS = ['up', 'down', 'left', 'right'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

const ARCMIN_PER_DEG = 60;

/** Display constants (PVANC §7.3). */
const BACKGROUND_LUMINANCE = 200 as Candela;
const WEBER_CONTRAST = 0.9 as WeberContrast;

/** Timing (PVANC §6.5): self-paced presentation, 500 ms ISI, 5 s response window. */
const INTER_STIMULUS_MS = 500;
const RESPONSE_WINDOW_MS = 5000;

export interface OptotypeGeometry {
  heightDeg: number;
  strokeDeg: number;
  gapDeg: number;
  crowdingThicknessDeg: number;
  crowdingSpacingDeg: number;
  crowdingLengthDeg: number;
}

/** Pure geometry from a logMAR size. Stroke (and the E's gap) equal the MAR. */
export function geometryForLogMar(logMAR: number): OptotypeGeometry {
  const marArcmin = Math.pow(10, logMAR);
  const strokeDeg = marArcmin / ARCMIN_PER_DEG;
  const heightDeg = 5 * strokeDeg;
  return {
    heightDeg,
    strokeDeg,
    gapDeg: strokeDeg,
    crowdingThicknessDeg: strokeDeg,
    crowdingSpacingDeg: 2 * strokeDeg,
    crowdingLengthDeg: 2 * heightDeg,
  };
}

/** Smallest critical detail (stroke) in arcmin — the adequacy gate's input. */
export function strokeArcmin(logMAR: number): number {
  return Math.pow(10, logMAR);
}

/**
 * Build a tumbling-E StimulusSpec at the requested size. The orientation (the
 * ground-truth identity) is drawn from the injected RNG so the sequence is
 * deterministic and replayable; it is never exposed to the UI as a hint.
 */
export function buildTumblingE(req: StimulusRequest, rng: SeededRng): StimulusSpec {
  const logMAR = req.intensity as unknown as number;
  const g = geometryForLogMar(logMAR);
  const orientation = ORIENTATIONS[rng.int(ORIENTATIONS.length)] as Orientation;

  return {
    kind: 'tumbling_e',
    intensity: logMAR as ScaleValue,
    geometry: {
      height: g.heightDeg as Degrees,
      stroke: g.strokeDeg as Degrees,
      gap: g.gapDeg as Degrees,
      crowdingThickness: g.crowdingThicknessDeg as Degrees,
      crowdingSpacing: g.crowdingSpacingDeg as Degrees,
      crowdingLength: g.crowdingLengthDeg as Degrees,
    },
    photometry: { backgroundLuminance: BACKGROUND_LUMINANCE, contrast: WEBER_CONTRAST },
    identity: orientation,
    flankers: {
      spacing: g.crowdingSpacingDeg as Degrees,
      thickness: g.crowdingThicknessDeg as Degrees,
      length: g.crowdingLengthDeg as Degrees,
    },
    responseModel: {
      alternatives: 4,
      chanceRate: 0.25,
      allowedModalities: ['swipe', 'tap', 'key'],
    },
    timing: {
      interStimulusMs: INTER_STIMULUS_MS,
      responseWindowMs: RESPONSE_WINDOW_MS,
    },
  };
}

/** Pick a wrong orientation (used by the reference observer for incorrect draws). */
export function wrongOrientation(correct: string, rng: SeededRng): Orientation {
  const others = ORIENTATIONS.filter((o) => o !== correct);
  return others[rng.int(others.length)] as Orientation;
}
