# `@vision-platform/core-contracts` — The Lingua Franca

PURE types and interfaces only. **No logic, no runtime behaviour, no dependencies.**
Every other package shares this, so the engine and modules can evolve independently as
long as the contract holds. This is the single dependency at the centre of the monorepo.

> See `docs/architecture/ARCHITECTURE.md` §3 and §10.

## Files (`src/`)

| File | Boundary it defines |
|---|---|
| `units.ts` | Physical/perceptual unit value types (branded `Degrees`, `Candela`, `LogMAR`, …). |
| `errors.ts` | Error taxonomy (`ErrorClass`, `PlatformError`) — §11. |
| `platform.contract.ts` | Platform Port: engine ⇄ host shell (`StimulusFrame`, `ResponseEvent`, `DeviceSignals`). |
| `module.contract.ts` | **Module interface**: `ModuleManifest`, `ModulePlugin`, `StimulusSpec`, results, observers — §3. |
| `calibration.contract.ts` | `CalibrationEngine`, `CalibrationProfile`, distance/luminance/adequacy — §5. |
| `quality.contract.ts` | `QualityEngine`, `QualityScore`, `ClaimGate` — §6. |
| `storage.contract.ts` | Repository ports + `TrialRecord` / `SessionRecord` / `ExportBundle` — §7. |
| `simulation.contract.ts` | Simulation Port: `VirtualObserver`, `SimulationHarness` — §8. |
| `index.ts` | Re-exports the above. |

Contracts use TypeScript `interface`/`type` declarations as the IDL. They are design
contracts to be implemented later in the engine, modules, and adapters — not logic.
