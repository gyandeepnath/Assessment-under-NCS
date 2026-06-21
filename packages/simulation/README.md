# `@vision-platform/simulation` — Simulation Layer

**This is where simulation lives.** It runs the **entire measurement loop headless and
deterministically** by replacing the human + host shell with a *virtual observer* behind
the Simulation Port. It is the backbone of validation and regression testing.

> Dev/off-device only — **never ships in a production or clinical build.** It exists to
> make the platform validatable. See `docs/architecture/ARCHITECTURE.md` §8. Contract
> types live in `@vision-platform/core-contracts` (`simulation.contract.ts`).

## Mechanism

The Simulation Port mirrors the Platform Port. Instead of rendering a `StimulusFrame` and
awaiting a human `ResponseEvent`, the harness asks a `VirtualObserver` (a psychometric
model with **known ground-truth parameters**) to respond. The engine, modules, calibration,
and QC are **unchanged** — only the edge is substituted, so a simulation exercises the
real measurement path.

## `src/` layout

| Folder | Role |
|---|---|
| `observers/` | Shared virtual-observer primitives (psychometric response models: threshold, slope, lapse, guess). Each module also ships its own `referenceObserver` via the module contract. |
| `harness/` | The headless session driver that wires a module + observer + calibration profile through the engine via the Simulation Port (`SimulationHarness.run` / `.sweep`). |
| `scenarios/` | Parametric sweeps and stress scenarios (distance drift, illuminance excursions, timeouts, device-class differences) used to confirm thresholds are recovered and QC flags fire. |

## What it enables

- **Ground-truth recovery** — drive an observer with a known threshold, confirm the engine
  recovers it within tolerance (bias & variance).
- **Procedure characterisation** — trials-to-convergence, posterior width vs trial count,
  floor/ceiling behaviour, robustness to lapses/guessing.
- **Deterministic regression** — every run is a seeded, reproducible fixture; any change in
  engine/module output is caught in CI.

## Dependencies

`@vision-platform/core-contracts`, plus the engine and modules under test (as dev/test wiring).
Never a dependency of any shipped package.
