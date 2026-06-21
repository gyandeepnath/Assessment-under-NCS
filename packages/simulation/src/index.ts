/**
 * @vision-platform/simulation — virtual observers & harness (dev only).
 *
 * Provides the psychometric observer used to validate the measurement core via
 * ground-truth recovery. The full headless harness that wires a ModulePlugin +
 * host is deferred until modules exist. See README.md and ARCHITECTURE §8.
 */

export { PsychometricObserver } from './observers/psychometric-observer.ts';
