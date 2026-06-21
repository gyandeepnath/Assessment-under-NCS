/**
 * PVANC simulated observers (dev/test only — never shipped).
 *
 * Ten observer types that drive a real PvancSession through the response source
 * (and, where relevant, the device/environment configuration). Each carries:
 *   - expectedBehavior:  how the simulated subject/condition behaves;
 *   - expectedOutput:    what the module SHOULD produce;
 *   - failureLooksLike:  the symptom that would mean the module is wrong.
 *
 * Subject responses follow the psychometric function in logMAR space. Some
 * observers perceive an EFFECTIVE size that differs from the nominal size the
 * module believes it is presenting (distance error, device pixel limit, reduced
 * brightness/contrast, calibration drift) — this is how environmental error
 * becomes a measurement bias the module may or may not detect.
 */

import { cumulativeGaussian, type EngineRng } from '@vision-platform/core-engine';
import { resolveDeviceProfile, acquireDistance, adequacy } from '@vision-platform/calibration-engine';
import { ORIENTATIONS } from '@vision-platform/module-acuity-pvanc';
import type { Responder, PvancSessionConfig } from '@vision-platform/module-acuity-pvanc';
import type { StimulusSpec, DeviceSignals } from '@vision-platform/core-contracts';

const NOW = '2026-06-21T00:00:00.000Z';

/** Standard, well-resourced device/distance used by most scenarios. */
export const PHONE_SIGNALS: DeviceSignals = {
  deviceModel: 'iPhone16,1',
  deviceClass: 'smartphone',
  ambientLux: 300,
  darkMode: 'off',
  colourFilter: 'off',
  autoBrightness: 'off',
  batteryLevel: 0.9,
  capturedAt: NOW,
};

/** Coarse, low-density display used by the device-constraint scenario. */
const COARSE_DESKTOP_SIGNALS: DeviceSignals = {
  deviceClass: 'desktop', // no deviceModel ⇒ generic per-class fallback (low ppd)
  ambientLux: 300,
  darkMode: 'off',
  colourFilter: 'off',
  autoBrightness: 'off',
  batteryLevel: 0.9,
  capturedAt: NOW,
};

// --- Observer model ---------------------------------------------------------

interface ObserverModel {
  trueThreshold: number;
  slope: number;
  guessRate: number;
  baseLapse: number;
  /** Pure chance responder (ignores stimulus size). */
  pureChance?: boolean;
  /** Map nominal logMAR → the size the subject effectively perceives. */
  effectiveSize?: (nominal: number, trial: number) => number;
  /** Lapse rate as a function of trial index (e.g. fatigue). */
  lapseAt?: (trial: number) => number;
  /** Response latency model (ms). */
  latency?: (rng: EngineRng, trial: number) => number;
}

/** Build a Responder from an observer model. Tracks its own trial index. */
export function makeResponder(model: ObserverModel, rng: EngineRng): Responder {
  let trial = 0;
  return (stimulus: StimulusSpec) => {
    const t = trial++;
    const nominal = stimulus.intensity as unknown as number;
    const eff = model.effectiveSize ? model.effectiveSize(nominal, t) : nominal;
    const lapse = model.lapseAt ? model.lapseAt(t) : model.baseLapse;
    const p = model.pureChance
      ? model.guessRate
      : cumulativeGaussian(eff, {
          threshold: model.trueThreshold,
          slope: model.slope,
          guessRate: model.guessRate,
          lapseRate: lapse,
        });
    const correct = rng.next() < p;
    const rawValue = correct ? stimulus.identity : pickWrong(stimulus.identity, rng);
    const latencyMs = model.latency ? model.latency(rng, t) : normalLatency(rng);
    return { rawValue, latencyMs };
  };
}

// --- Scenario definition ----------------------------------------------------

export interface ObserverScenario {
  id: string;
  name: string;
  expectedBehavior: string;
  expectedOutput: string;
  failureLooksLike: string;
  /** True acuity in logMAR, or null when undefined (random guesser). */
  groundTruthLogMAR: number | null;
  /** Device/distance overrides applied to the session config. */
  configOverrides?: Partial<PvancSessionConfig>;
  makeResponder: (rng: EngineRng) => Responder;
}

/** Compute the finest logMAR a device can render at a distance (its pixel limit). */
function deviceLimitLogMAR(signals: DeviceSignals, distanceM: number): number {
  const device = resolveDeviceProfile(signals);
  const distance = acquireDistance('cord-measured', distanceM);
  const report = adequacy({ device, distance, requiredDetailArcmin: 0.5, minPixelsPerDetail: 2 });
  return Math.log10(report.limitArcmin);
}

const COARSE_LIMIT = deviceLimitLogMAR(COARSE_DESKTOP_SIGNALS, 0.4);

// --- The ten observers ------------------------------------------------------

export const SCENARIOS: ObserverScenario[] = [
  {
    id: 'ideal',
    name: '1. Ideal observer',
    expectedBehavior: 'Near-deterministic psychometric (steep slope 4 — the top of the procedure\'s modelled range — and negligible lapses) at true acuity 0.0 logMAR.',
    expectedOutput: 'Completed; estimate ≈ 0.0 logMAR; within-expected.',
    failureLooksLike: 'Biased estimate (|error| > 0.12) or failure to converge.',
    groundTruthLogMAR: 0.0,
    makeResponder: (rng) => makeResponder({ trueThreshold: 0.0, slope: 4, guessRate: 0.25, baseLapse: 0.005 }, rng),
  },
  {
    id: 'noisy-attentive',
    name: '2. Noisy but attentive observer',
    expectedBehavior: 'Realistic psychometric (slope 2.0, 3% lapses) at true acuity 0.3 logMAR; normal response times.',
    expectedOutput: 'Completed; unbiased estimate ≈ 0.3; moderate quality.',
    failureLooksLike: 'Systematic bias > 0.15 logMAR or quality misreporting reliability.',
    groundTruthLogMAR: 0.3,
    makeResponder: (rng) => makeResponder({ trueThreshold: 0.3, slope: 2.0, guessRate: 0.25, baseLapse: 0.03 }, rng),
  },
  {
    id: 'random-guesser',
    name: '3. Random guesser',
    expectedBehavior: 'Responds at chance (25%) regardless of optotype size — non-compliant subject.',
    expectedOutput: 'Should NOT report a normal acuity with confidence: expect floor → inconclusive (retake), or a very poor estimate at low quality.',
    failureLooksLike: 'Reports a within-expected acuity at usable quality (false reassurance).',
    groundTruthLogMAR: null,
    makeResponder: (rng) => makeResponder({ trueThreshold: 0, slope: 2, guessRate: 0.25, baseLapse: 0.02, pureChance: true }, rng),
  },
  {
    id: 'fatigued',
    name: '4. Fatigued observer',
    expectedBehavior: 'Starts attentive (true 0.3) but lapse rate rises and responses slow over trials; late trials time out.',
    expectedOutput: 'Completed or inconclusive; estimate no better than true (slight worsening); reduced quality; timeout/latency flags.',
    failureLooksLike: 'Reports a better-than-true acuity, or full quality despite degradation.',
    groundTruthLogMAR: 0.3,
    makeResponder: (rng) =>
      makeResponder(
        {
          trueThreshold: 0.3,
          slope: 2.0,
          guessRate: 0.25,
          baseLapse: 0.02,
          lapseAt: (t) => Math.min(0.02 + 0.012 * t, 0.45),
          latency: (rng2, t) => Math.max(300, Math.round(700 + 140 * t + gaussian(rng2) * 200)),
        },
        rng,
      ),
  },
  {
    id: 'learning',
    name: '5. Learning-effect observer',
    expectedBehavior: 'Improves during the session: effective acuity moves from ~0.4 to ~0.2 logMAR as familiarity grows.',
    expectedOutput: 'Completed; estimate lands between the early and late true thresholds (≈ 0.2–0.4).',
    failureLooksLike: 'Estimate outside the bracket, or instability/non-convergence.',
    groundTruthLogMAR: 0.3, // mid-point reference
    makeResponder: (rng) =>
      makeResponder(
        {
          trueThreshold: 0.4,
          slope: 2.0,
          guessRate: 0.25,
          baseLapse: 0.02,
          // Subject improves: later trials are effectively easier by up to 0.2 logMAR.
          effectiveSize: (nominal, t) => nominal + Math.min(0.2, 0.01 * t),
        },
        rng,
      ),
  },
  {
    id: 'low-vision',
    name: '6. Low-vision observer',
    expectedBehavior: 'Genuinely reduced acuity at true 0.8 logMAR (≈ 20/125).',
    expectedOutput: 'Completed; estimate ≈ 0.8; category below-expected.',
    failureLooksLike: 'Reports a within-expected / good acuity (dangerous false negative).',
    groundTruthLogMAR: 0.8,
    makeResponder: (rng) => makeResponder({ trueThreshold: 0.8, slope: 2.0, guessRate: 0.25, baseLapse: 0.02 }, rng),
  },
  {
    id: 'device-constraint',
    name: '7. Device-constraint observer',
    expectedBehavior: `Sharp-eyed subject (true 0.0) on a coarse display that cannot render finer than ~${COARSE_LIMIT.toFixed(2)} logMAR at 0.4 m; optotypes below that size are pixelated/unresolvable, so performance drops to chance.`,
    expectedOutput: 'Adequacy gate fails and caps quality at 70; the estimate is limited near the device limit (≈ device floor), and the cap + maxMeasurable signal the result is device-limited, not eye-limited.',
    failureLooksLike: 'Adequacy passes / no quality cap while reporting a poor acuity as if it were the eye, or an impossibly good acuity below what the device can render.',
    groundTruthLogMAR: null, // the eye\'s true acuity is unmeasurable on this device
    configOverrides: { deviceSignals: COARSE_DESKTOP_SIGNALS, distance: { method: 'cord-measured', valueMetres: 0.4 } },
    makeResponder: (rng) =>
      makeResponder(
        {
          trueThreshold: 0.0,
          slope: 2.0,
          guessRate: 0.25,
          baseLapse: 0.02,
          // Sizes finer than the device can render are unresolvable ⇒ effectively
          // far below threshold ⇒ chance performance.
          effectiveSize: (nominal) => (nominal >= COARSE_LIMIT ? nominal : -5),
        },
        rng,
      ),
  },
  {
    id: 'distance-error',
    name: '8. Distance-error observer',
    expectedBehavior: 'Module is told 2 m (cord-measured) but the subject sits at 1.5 m, so optotypes appear larger/easier. A camera corroboration reads the true 1.5 m.',
    expectedOutput: 'The estimate is still biased (better-than-true), BUT the corroboration disagreement is detected: distance-stability quality drops, confidence falls, a disagreement flag fires, and the result is no longer presented confidently (→ retake).',
    failureLooksLike: 'Confident, unflagged bias with distance quality still at 100 (the pre-fix W2 behaviour).',
    groundTruthLogMAR: 0.3,
    // Module is TOLD 2 m; subject is actually at 1.5 m → effective size shift = log10(2/1.5).
    // A camera reading corroborates the real 1.5 m, exposing the wrong primary distance.
    configOverrides: {
      distance: { method: 'cord-measured', valueMetres: 2, corroboration: { method: 'camera-estimated', valueMetres: 1.5 } },
    },
    makeResponder: (rng) =>
      makeResponder(
        {
          trueThreshold: 0.3,
          slope: 2.0,
          guessRate: 0.25,
          baseLapse: 0.02,
          effectiveSize: (nominal) => nominal + Math.log10(2 / 1.5),
        },
        rng,
      ),
  },
  {
    id: 'brightness-variation',
    name: '9. Brightness-variation observer',
    expectedBehavior: 'Auto-brightness is enabled and reduced luminance lowers effective contrast, making optotypes ~0.06 logMAR harder.',
    expectedOutput: 'A small worse-than-true bias AND an auto-brightness quality flag.',
    failureLooksLike: 'No flag and/or a large unexplained bias.',
    groundTruthLogMAR: 0.3,
    configOverrides: { deviceSignals: { ...PHONE_SIGNALS, autoBrightness: 'on' } },
    makeResponder: (rng) =>
      makeResponder(
        {
          trueThreshold: 0.3,
          slope: 2.0,
          guessRate: 0.25,
          baseLapse: 0.02,
          effectiveSize: (nominal) => nominal - 0.06, // lower brightness ⇒ harder
        },
        rng,
      ),
  },
  {
    id: 'calibration-drift',
    name: '10. Calibration-drift observer',
    expectedBehavior: 'Aged display: luminance has silently degraded, making optotypes ~0.05 logMAR harder, with NO in-session signal.',
    expectedOutput: 'A small worse-than-true bias. v1 cannot detect single-session drift (PVANC §10.4 needs cross-session tracking); this is a documented limitation.',
    failureLooksLike: 'A large bias, or the platform claiming to detect drift it cannot (over-claiming).',
    groundTruthLogMAR: 0.3,
    makeResponder: (rng) =>
      makeResponder(
        {
          trueThreshold: 0.3,
          slope: 2.0,
          guessRate: 0.25,
          baseLapse: 0.02,
          effectiveSize: (nominal) => nominal - 0.05,
        },
        rng,
      ),
  },
];

// --- helpers ---------------------------------------------------------------

function pickWrong(correct: string, rng: EngineRng): string {
  const others = ORIENTATIONS.filter((o) => o !== correct);
  return others[rng.int(others.length)] as string;
}

function normalLatency(rng: EngineRng): number {
  return Math.max(300, Math.round(800 + gaussian(rng) * 150));
}

function gaussian(rng: EngineRng): number {
  const u1 = Math.max(rng.next(), 1e-12);
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
