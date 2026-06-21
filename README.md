# Assessment-under-NCS

Modular psychophysics-based vision assessment platform (smartphone, tablet, desktop,
and similar displays).

> **Status: repository skeleton.** Folder structure, boundaries, naming conventions, and
> interface **contracts** only — no measurement, test, or module logic implemented yet.

## Documentation

- **[Architecture](docs/architecture/ARCHITECTURE.md)** — full platform architecture.
- **[Conventions](docs/architecture/CONVENTIONS.md)** — naming, boundaries, dependency rules, file layout.
- **[Specs](docs/specs/)** — versioned scientific specifications (first: `PVANC-1.0-SPEC`).

## Repository map

```
packages/
  core-contracts/      # PURE types/interfaces — the lingua franca (module interface lives here)
  core-engine/         # shared measurement core (session, trial runner, adaptive procedures, log)
  calibration-engine/  # device profiles, distance, luminance/gamma, ppd adequacy
  quality-engine/      # QC checks, scoring, completeness gates, claim gating
  data-layer/          # storage: append-only RAW trial data, sessions, longitudinal, export
  simulation/          # virtual observers + headless harness (dev only)
  validation/          # agreement/reliability/recovery tooling + reports (dev only)
  modules/             # one plug-in per construct (acuity-pvanc is the reference template)
apps/                  # thin per-platform host shells (web, mobile, desktop)
tooling/               # CI gates, module scaffold, schema codegen
docs/                  # architecture, specs, validation protocols, ADRs
```

### Where the key things live

| You're looking for | Go to |
|---|---|
| The **shared engine** design | `packages/core-engine/` |
| The **module interface** | `packages/core-contracts/src/module.contract.ts` + `packages/modules/README.md` |
| **Raw data** (trial-level, append-only) | `packages/data-layer/` (export in `src/export/`) |
| **Quality control** | `packages/quality-engine/` |
| **Calibration** | `packages/calibration-engine/` |
| **Simulation** | `packages/simulation/` |
| **Validation** | `packages/validation/` (+ per-module `validation/`) |
| **Tests** | colocated `*.test.ts`, per-package `tests/`, recovery in module `validation/` |

This is a workspace monorepo. No dependencies are installed yet; package boundaries and the
allowed dependency direction are documented in [CONVENTIONS](docs/architecture/CONVENTIONS.md).
