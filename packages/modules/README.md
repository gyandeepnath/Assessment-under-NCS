# Module Plug-ins — Boundaries

One package per construct. Each implements the `ModulePlugin` contract from
`@vision-platform/core-contracts` and supplies **construct knowledge only**. The shared
engine drives the measurement loop; modules are passive suppliers of pure functions.

> Skeleton status: every module here is a placeholder (`src/module.def.ts` + README).
> `acuity-pvanc` is the reference template with the full subfolder breakdown. See
> `docs/architecture/ARCHITECTURE.md` §3.

## The hard boundary rules (enforced by the Module Host sandbox)

A module **MUST NOT**:

1. Perform I/O, persistence, networking, or wall-clock reads — use the injected `SeededRng` and `Clock`.
2. Render or read the screen directly — that is the host shell's job.
3. **Import any other `@vision-platform/module-*` package.** Modules are siblings that never see each other.
4. Emit a result whose claims exceed its `validationStatus` — the engine's claim gate enforces this.

A module **MUST** be deterministic: same inputs + same seed ⇒ same stimulus sequence and same result.

## Standard module layout (template: `acuity-pvanc/`)

```
modules/<name>/
├── package.json              # @vision-platform/module-<name>
├── README.md                 # construct, scale, spec, validation status, boundary
├── spec/                     # pointer to the canonical scientific spec in docs/specs/
├── src/
│   ├── module.def.ts         # manifest + ModulePlugin implementation (entry point)
│   ├── stimulus/             # stimulus geometry in physical units (+ flankers/crowding)
│   ├── scoring/              # response → outcome, result derivation, notation conversions
│   ├── norms/                # normative tables (e.g. age-stratified)
│   └── observer-model/       # reference virtual observer for simulation/validation
├── validation/              # module-specific recovery harness (Tier A) wiring
└── tests/                   # unit + integration tests for this module
```

Simpler modules keep `src/` flat until they need the breakdown; they still expose
`src/module.def.ts` as the single entry point.

## Conformance

A package is a valid module only if it passes the **Module Conformance Suite**
(scaffolded by `tooling/module-scaffold`): manifest validity; purity of
`nextStimulus` / `scoreResponse` / `deriveResult`; deterministic replay; and a passing
ground-truth recovery run in the Simulation Layer.

## Planned modules

`acuity-pvanc` (reference), `near-acuity`, `reading`, `contrast-sensitivity`,
`colour-vision`, `stereoacuity`, `suppression-rivalry`, `fixation-stability`, `crowding`,
`visual-field-screen`, `low-vision-tasks`, `accommodation-vergence`, `reaction-pupil`.
