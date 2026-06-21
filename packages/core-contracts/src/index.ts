/**
 * @vision-platform/core-contracts — the platform's lingua franca.
 *
 * PURE types and interfaces only. No logic, no runtime behaviour, no
 * dependencies. Every other package shares this so the engine and modules can
 * evolve independently as long as the contract holds.
 *
 * See docs/architecture/ARCHITECTURE.md §3 and §10.
 */

export * from './units.ts';
export * from './errors.ts';
export * from './platform.contract.ts';
export * from './module.contract.ts';
export * from './calibration.contract.ts';
export * from './quality.contract.ts';
export * from './storage.contract.ts';
export * from './simulation.contract.ts';
