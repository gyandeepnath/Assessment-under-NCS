# Naming & Structure Conventions

These conventions keep module boundaries legible and enforce the dependency direction from
the architecture. They apply to the whole monorepo.

## 1. Packages

- All packages are scoped: **`@vision-platform/<name>`**.
- Module plug-ins are prefixed to stand out: **`@vision-platform/module-<construct>`**
  (e.g. `@vision-platform/module-acuity-pvanc`), living under `packages/modules/<construct>/`.
- Package directory names are **kebab-case** and match the unscoped package name.
- Every package is `private: true` and starts at version `0.0.0` until it ships.

## 2. Dependency direction (boundaries)

Dependencies point **downward and inward only**. Allowed edges:

```
host shells (apps/*)          → core-engine, core-contracts
core-engine                   → core-contracts
calibration-engine            → core-contracts
quality-engine                → core-contracts
data-layer (+ adapters)       → core-contracts
modules/*                     → core-contracts            (NEVER another module)
simulation                    → core-contracts, core-engine, modules-under-test  (dev only)
validation                    → core-contracts, simulation                       (dev only)
core-contracts                → (nothing)
```

- **No package imports a sibling module.** `modules/a` may not import `modules/b`.
- **Nothing shipped depends on `simulation` or `validation`** (dev/off-device only).
- Concrete third-party drivers (DB clients, native bindings) live in the leaf folder that
  needs them (e.g. `data-layer/src/adapters/sqlite/`), never at a package root.

## 3. Files

| Kind | Convention | Example |
|---|---|---|
| Contract/interface file | `*.contract.ts` | `module.contract.ts` |
| Module entry point | `module.def.ts` | `modules/acuity-pvanc/src/module.def.ts` |
| Source files & folders | kebab-case | `trial-runner.ts` |
| Unit test (colocated, fast) | `*.test.ts` | `staircase.test.ts` |
| Integration test (per package) | `tests/*.test.ts` | `tests/session.test.ts` |
| Simulation recovery (Tier A) | `*.recovery.ts` | `acuity-pvanc.recovery.ts` |
| Validation protocol (data) | `docs/validation/<module>.protocol.yaml` | `acuity-pvanc.protocol.yaml` |
| Scientific spec | `docs/specs/<SPEC-ID>.md` | `PVANC-1.0-SPEC.md` |
| Architecture decisions | `docs/architecture/adr/NNNN-title.md` | `0001-monorepo-layout.md` |

## 4. Identifiers (in TypeScript)

- Types/interfaces: **PascalCase** (`ModulePlugin`, `TrialRecord`).
- Functions/variables: **camelCase**.
- Constants/enually-fixed values: **UPPER_SNAKE_CASE**.
- Branded unit types from `units.ts` are used at the module boundary instead of bare `number`.

## 5. Where things live (quick map)

| Concern | Location |
|---|---|
| Shared engine | `packages/core-engine/` |
| Module interface (the contract) | `packages/core-contracts/src/module.contract.ts` |
| A module's logic | `packages/modules/<name>/src/` |
| Raw trial data (storage) | `packages/data-layer/` (trial store = append-only) |
| Exportable raw data | `packages/data-layer/src/export/` |
| Quality control | `packages/quality-engine/` |
| Calibration | `packages/calibration-engine/` |
| Simulation | `packages/simulation/` (dev only) |
| Validation tooling | `packages/validation/` (+ per-module `validation/`) |
| Tests | colocated `*.test.ts` and per-package `tests/`; recovery in module `validation/` |
| Host shells | `apps/{web,mobile,desktop}/` |
| Build/CI/scaffolding | `tooling/` |
| Specs & ADRs | `docs/specs/`, `docs/architecture/` |

## 6. Versioning (recap — full policy in ARCHITECTURE §12)

Four independent axes, all stamped on every stored record: engine **contract API** (SemVer
on `core-contracts`), **module** code (SemVer), **scientific spec** (immutable once
released), and **data schema** (forward-only migrations). Any measurement-affecting change
is a **major** bump and requires re-validation before a `validated` claim is restored.
