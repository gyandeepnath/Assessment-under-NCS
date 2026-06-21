/**
 * @vision-platform/core-engine — shared measurement core (public surface).
 *
 * Construct-agnostic measurement machinery shared by every future module:
 * deterministic RNG, monotonic clock, stimulus timing, append-only trial log,
 * and the adaptive threshold procedures (staircase + QUEST+). See README.md and
 * docs/architecture/ARCHITECTURE.md §4.
 *
 * The session-orchestrator FSM and trial-runner integration (which wire a
 * concrete ModulePlugin to a host) are intentionally deferred until modules and
 * host shells exist; their folders carry placeholders.
 */

export { Mulberry32, createRng, hashSeed, type EngineRng } from './rng/seeded-rng.ts';
export { SystemClock, ManualClock, type Clock } from './clock/clock.ts';
export {
  StimulusTimer,
  type TimingConfig,
  type TrialTiming,
  type TimingClassification,
} from './timing/stimulus-timing.ts';
export { TrialLog, type TrialListener, type EventListener } from './trial-log/trial-log.ts';

export {
  cumulativeGaussian,
  weibull,
  normalCdf,
  erf,
  clampProb,
  type PsiParams,
  type PsychometricFn,
} from './adaptive/psychometric/psychometric.ts';
export { Staircase, type StaircaseConfig } from './adaptive/staircase/staircase.ts';
export {
  QuestPlus,
  type QuestPlusConfig,
  type QuestEstimate,
} from './adaptive/questplus/questplus.ts';
