# `@vision-platform/core-engine` — Shared Measurement Core

The construct-agnostic measurement machinery shared by **every** module. It knows
about trials, stimuli, responses, adaptive procedures, thresholds, and logging — and
nothing about acuity, contrast, colour, or stereopsis. All construct knowledge lives
in module plug-ins (`packages/modules/*`).

> Skeleton status: component folders below contain placeholder stubs only. No
> measurement logic yet. See `docs/architecture/ARCHITECTURE.md` §4.

## Components (`src/`)

| Folder | Responsibility | Must NOT do |
|---|---|---|
| `session-orchestrator/` | Owns the session lifecycle as an explicit FSM (`created → calibrating → eligibility → practice → measuring(phaseN) → scoring → complete/aborted/paused`). The single conductor; coordinates calibration, eligibility, QC, and storage at each transition; handles pause/resume. | Decide stimulus content or thresholds |
| `trial-runner/` | The atomic `present → collect → score` loop. Asks the module for a stimulus, hands a `StimulusFrame` to the host, awaits a `ResponseEvent`, asks the module to score it, emits a `TrialRecord`, feeds the outcome to the adaptive procedure. | Construct semantics; rendering |
| `adaptive/` | Reusable, validated adaptive procedures. Modules **select and parameterise** these; they never reimplement one. | Know what "intensity" physically means |
| `adaptive/staircase/` | n-down/m-up staircases (e.g. PVANC Phase 1 bracketing). | — |
| `adaptive/questplus/` | QUEST+ Bayesian posterior updating (PVANC Phase 2). | — |
| `adaptive/psychometric/` | Probit/logit psychometric functions, posterior summaries. | — |
| `module-host/` | Loads modules, validates manifests, pins engine-API compatibility, sandboxes module calls (enforces purity / no-I/O / no cross-module imports), routes engine↔module calls. | Module internals |
| `trial-log/` | Append-only, ordered, timestamped event bus. The single source of truth from which all results are recomputable; serialises to the data layer. | Aggregation/interpretation |
| `rng/` | Seeded deterministic RNG injected everywhere (stimulus order, optotype identity). Enables replay & simulation. | — |
| `clock/` | Monotonic timing abstraction injected everywhere. | — |

## Engine invariants

1. Never store a result without an attached `CalibrationProfile` reference **and** a `QualityScore`.
2. Every `TrialRecord` carries enough to replay it: seed, module version, intensity, stimulus identity, calibration ref, raw response, timestamps.
3. Deterministic: same seed + module version + calibration + response sequence ⇒ same stimulus sequence and same result — whether driven by a human (Platform Port) or a virtual observer (Simulation Port).

## Dependencies

`@vision-platform/core-contracts` only. The engine depends on **nothing above it** and on
no concrete module, storage adapter, or host shell.
