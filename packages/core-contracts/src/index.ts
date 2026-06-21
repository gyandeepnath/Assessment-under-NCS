/**
 * @vision-platform/core-contracts — the platform's lingua franca.
 *
 * PURE types and interfaces only. No logic, no runtime behaviour, no
 * dependencies. Every other package shares this so the engine and modules can
 * evolve independently as long as the contract holds.
 *
 * See docs/architecture/ARCHITECTURE.md §3 and §10.
 */

export * from './units';
export * from './errors';
export * from './platform.contract';
export * from './module.contract';
export * from './calibration.contract';
export * from './quality.contract';
export * from './storage.contract';
export * from './simulation.contract';
